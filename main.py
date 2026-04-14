from flask import *
from pymongo import MongoClient
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import json
import os
import time
import urllib.parse
from bs4 import BeautifulSoup
import requests
from bson import json_util, ObjectId
from datetime import datetime, timezone, timedelta

from utility.cve import cve_request
from utility.rss import resolve_feed_url, fetch_feeds
ip = "192.168.100.200"

# ── Startup guards ─────────────────────────────────────────────────────────────
_SECRET_KEY      = os.environ.get("SECRET_KEY", "")
_PASSWORD_HASH   = os.environ.get("APP_PASSWORD_HASH", "")
_WEAK_DEFAULTS   = {"super_secret_key_hahaha", "secret", "changeme", ""}

if _SECRET_KEY in _WEAK_DEFAULTS:
    raise RuntimeError("SECRET_KEY env var is missing or weak. Set a strong random value.")
if not _PASSWORD_HASH:
    raise RuntimeError("APP_PASSWORD_HASH env var is not set. Run utility/hash_password.py to generate one.")

app = Flask(__name__)
app.secret_key = _SECRET_KEY
app.permanent_session_lifetime = timedelta(hours=8)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

limiter = Limiter(get_remote_address, app=app, default_limits=[])

user = urllib.parse.quote_plus(os.environ['user'])
password = urllib.parse.quote_plus(os.environ['pass'])

mongoUri = f"mongodb://{user}:{password}@192.168.100.200:27017/blog?authSource=admin"
client = MongoClient(mongoUri)
db = client['blog']
notes_collection = db.get_collection("notes")
attack_paths_collection = db.get_collection("attack_paths")
rss_feeds_collection = db.get_collection("rss_feeds")

@app.before_request
def check_auth():
    endpoints_without_auth = ["login", "authentication", "cve"]
    if not session.get("authenticated") and request.endpoint not in endpoints_without_auth:
        return redirect(url_for("login"))


def parse_json(data):
    return json.loads(json_util.dumps(data))

@app.route("/login")
def login():
    if session.get("authenticated"):
        return redirect(url_for("home"))
    return render_template("login.html")
@app.route("/add")
def post_form():
    return render_template("add_note_form.html")

@app.route("/")
def home():
    print(list(notes_collection.find()))
    data = list(notes_collection.find())
    if len(data) != 0:
        return render_template("new_home.html",notes=data)
    
    return "<h1>HELLO THEREE</h1>"

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/admin")
def admin():
    beta = request.args.get("beta")
    response = make_response(render_template("admin.html", title="Admin dashboard"))
    if beta != None:
        response = make_response(render_template("admin2.html", title="Admin dashboard"))
    return response
    

@app.route("/api/auth", methods=["POST"])
@limiter.limit("10 per 15 minutes")
def authentication():
    data = request.get_json(silent=True) or {}
    submitted = data.get("password", "")
    try:
        ph.verify(_PASSWORD_HASH, submitted)
    except VerifyMismatchError:
        time.sleep(0.5)
        return json.dumps({"error": "invalid_credentials"}), 401, {"Content-Type": "application/json"}
    session.permanent = True
    session["authenticated"] = True
    session["auth_ts"] = int(time.time())
    return json.dumps({"ok": True}), 200, {"Content-Type": "application/json"}

@app.route("/api/cve")
def cve_api():
    return json.dumps(cve_request())

@app.route("/api/add", methods=['POST'])
def addNotes():
    raw_data = request.get_json()  # Gets raw body as bytes
    alreadyExist = notes_collection.find_one(parse_json({"title":raw_data["title"]}))
    if alreadyExist is not None:
        return "already exist"

    newNote = {"note":raw_data["note"],"title":raw_data["title"],"tags":raw_data["tags"]}
    parsed_note = parse_json(newNote)
    res = notes_collection.insert_one(parsed_note)
    #print(res)
    # alreadyExist = filter(lambda x: x["title"] == raw_data["title"],list(notes))
    return json.dumps({"Status":"Note added"})


@app.route("/api/notes")
def getNotes():
    notes = list(notes_collection.find({}))
    for note in notes:
        note['_id'] = str(note['_id'])
    return json.dumps(notes), 200, {"Content-Type": "application/json"}

@app.route("/api/delete", methods=["DELETE"])
def deleteNote():
    data = request.get_json()
    if not data or not data.get('id'):
        return json.dumps({"error": "id is required"}), 400
    try:
        res = notes_collection.delete_one({"_id": ObjectId(data['id'])})
    except Exception:
        return json.dumps({"error": "invalid id"}), 400
    return f"{res.deleted_count} deleted!"

@app.route("/api/note", methods=["PUT"])
def updateNote():
    data = request.get_json(silent=True)
    if not data or not data.get("id"):
        return json.dumps({"error": "id is required"}), 400, {"Content-Type": "application/json"}

    note = data.get("note", "").strip()
    tags = data.get("tags", "")

    if not note:
        return json.dumps({"error": "note body is required"}), 400, {"Content-Type": "application/json"}

    try:
        res = notes_collection.update_one(
            {"_id": ObjectId(data["id"])},
            {"$set": {"note": note, "tags": tags}}
        )
    except Exception:
        return json.dumps({"error": "invalid id"}), 400, {"Content-Type": "application/json"}

    if res.matched_count == 0:
        return json.dumps({"error": "not found"}), 404, {"Content-Type": "application/json"}

    return json.dumps({"Status": "Note updated"}), 200, {"Content-Type": "application/json"}

@app.route("/cve", methods=["GET"])
def cve():
    isApi = request.args.get("api")
    if isApi != None:
        return json.dumps(cve_request())
    print(cve_request())
    return render_template("cve.html",cves=cve_request())

@app.route("/api/attack-paths", methods=["GET"])
def getAttackPaths():
    paths = list(attack_paths_collection.find({}, {"_id": 0}))
    return json.dumps(paths), 200, {"Content-Type": "application/json"}

@app.route("/api/attack-path", methods=["DELETE"])
def deleteAttackPath():
    name = request.args.get("name")
    if not name:
        return json.dumps({"error": "name is required"}), 400
    res = attack_paths_collection.delete_one({"name": name})
    return json.dumps({"deleted": res.deleted_count}), 200, {"Content-Type": "application/json"}

@app.route("/api/attack-path", methods=["PUT"])
def editAttackPath():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return json.dumps({"error": "body must be a JSON array"}), 400
    name         = request.args.get("name", "")
    markdown     = request.args.get("markdown", "")
    pentest_note = request.args.get("pentest_note", "")
    if not name:
        return json.dumps({"error": "name is required"}), 400
    res = attack_paths_collection.update_one(
        {"name": name},
        {"$set": {"paths": data, "markdown": markdown, "pentest_note": pentest_note}}
    )
    if res.matched_count == 0:
        return json.dumps({"error": "not found"}), 404
    return json.dumps({"updated": res.modified_count}), 200, {"Content-Type": "application/json"}

@app.route("/api/attack-path", methods=["POST"])
def attackPath():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return json.dumps({"error": "body must be a JSON array"}), 400
    name         = request.args.get("name", "unnamed")
    markdown     = request.args.get("markdown", "")
    pentest_note = request.args.get("pentest_note", "")
    save         = request.args.get("save", "false").lower() == "true"
    doc          = {"name": name, "paths": data}
    if save:
        doc["markdown"]     = markdown
        doc["pentest_note"] = pentest_note
        attack_paths_collection.insert_one(doc)
    return render_template("attack_path_gen.html", doc=doc)


@app.route("/api/analyze-path", methods=["POST"])
def analyzeAttackPath():
    data = request.get_json(force=True)
    try:
        resp = requests.post(
            "http://192.168.100.200:8888/api/analyze-path",
            json=data,
            timeout=130
        )
        return resp.content, resp.status_code, {"Content-Type": "application/json"}
    except requests.exceptions.ConnectionError:
        return json.dumps({"error": "MCP server unavailable"}), 502, {"Content-Type": "application/json"}
    except requests.exceptions.Timeout:
        return json.dumps({"error": "MCP server timed out"}), 504, {"Content-Type": "application/json"}


@app.route("/util")
def util():
    return test()


# ── RSS / Newsfeed endpoints ───────────────────────────────────────────────────

@app.route("/api/feeds", methods=["GET"])
def get_feeds():
    """Return all stored feed subscriptions, excluding MongoDB _id."""
    feeds = list(rss_feeds_collection.find({}, {"_id": 0}))
    return json.dumps(feeds), 200, {"Content-Type": "application/json"}


@app.route("/api/feeds", methods=["POST"])
def add_feed():
    """
    Add a new feed subscription.
    Body: {"url": "...", "label": "..."}
    Resolves YouTube URLs/channel IDs to canonical feed URLs.
    Returns 409 if the URL already exists.
    """
    data  = request.get_json(force=True, silent=True)
    if not data or not data.get("url"):
        return json.dumps({"error": "url is required"}), 400, {"Content-Type": "application/json"}

    raw_url = data["url"].strip()
    label   = str(data.get("label", "") or "").strip()[:120]  # cap label length

    try:
        canonical_url, feed_type = resolve_feed_url(raw_url)
    except ValueError as exc:
        return json.dumps({"error": str(exc)}), 400, {"Content-Type": "application/json"}

    # Only http/https — no file://, ftp://, etc. (SSRF mitigation)
    if not canonical_url.startswith(("http://", "https://")):
        return json.dumps({"error": "Invalid feed URL scheme."}), 400, {"Content-Type": "application/json"}

    # Conflict check
    if rss_feeds_collection.find_one({"url": canonical_url}):
        return json.dumps({"error": "Feed already exists."}), 409, {"Content-Type": "application/json"}

    if not label:
        label = canonical_url[:80]

    doc = {
        "url":      canonical_url,
        "label":    label,
        "type":     feed_type,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    rss_feeds_collection.insert_one(doc)
    doc.pop("_id", None)
    return json.dumps(doc), 201, {"Content-Type": "application/json"}


@app.route("/api/feeds", methods=["DELETE"])
def delete_feed():
    """Delete a feed by URL. Query param: ?url=..."""
    url = request.args.get("url", "").strip()
    if not url:
        return json.dumps({"error": "url query param is required"}), 400, {"Content-Type": "application/json"}

    res = rss_feeds_collection.delete_one({"url": url})
    return json.dumps({"deleted": res.deleted_count}), 200, {"Content-Type": "application/json"}


@app.route("/api/newsfeed", methods=["GET"])
def get_newsfeed():
    """Fetch live articles from all stored feeds, sorted newest-first."""
    feeds = list(rss_feeds_collection.find({}, {"_id": 0}))
    if not feeds:
        return json.dumps([]), 200, {"Content-Type": "application/json"}

    articles = fetch_feeds(feeds, limit=60)
    return json.dumps(articles), 200, {"Content-Type": "application/json"}


app.run(host='0.0.0.0',port=80)
