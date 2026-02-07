from flask import *
from pymongo import MongoClient
import json
import os
import urllib.parse
from bs4 import  BeautifulSoup
import requests
from bson import json_util

from utility.cve import cve_request
ip = "192.168.100.200"

app = Flask(__name__)
app.secret_key = "super_secret_key_hahaha"
notes=[]


user = urllib.parse.quote_plus(os.environ['user'])
password = urllib.parse.quote_plus(os.environ['pass'])

mongoUri = f"mongodb://{user}:{password}@192.168.100.200:27017/blog?authSource=admin"
client = MongoClient(mongoUri)
db = client['blog']
notes_collection = db.get_collection("notes")

VALID_TOKEN = f"valid_token"

@app.before_request
def check_auth():
    token = request.headers.get("Authorization")
    endpoints_without_auth = ["login","authentication","cve","home"]
    if 'pass' not in session and request.endpoint not in endpoints_without_auth:
        return redirect(url_for("login")), 401


def parse_json(data):
    return json.loads(json_util.dumps(data))

@app.route("/login")
def login():
    if 'pass' in session:
        return redirect(url_for("home"))
    return render_template("login.html")

@app.route("/")
def home():
    print(list(notes_collection.find()))
    data = list(notes_collection.find())
    if len(data) != 0:
        return render_template("home.html",notes=data)
    
    return "<h1>HELLO THEREE</h1>"

@app.route("/api/logout")
def logout():
    session.pop("pass",None)
    return redirect(url_for("login"))

@app.route("/admin")
def admin():
    response = make_response(render_template("admin.html", title="Admin dashboard"))
    return response
    

@app.route("/api/auth",methods=["POST"])
def authentication():
    if request.method != "POST":
        return redirect(url_for("home"))
    password = request.form.get("password")
    if password != "secret_password":
        return json.dumps({"message":"try again"})
    session["pass"] = password
    res = make_response(redirect(url_for("admin")))
    return res


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
    notes = list(notes_collection.find({},{"_id":0}))
    # remove ObjectId data type to the colelction
    if len(notes) ==0:
        return "No stored notes"
    return json.dumps(notes)

@app.route("/api/delete", methods=["DELETE"])
def deleteNote():
    data = request.get_json()
    delete_query = {"title":data['title']}
    res = notes_collection.delete_one(delete_query)
    return f"{res.deleted_count} deleted!"

@app.route("/cve", methods=["GET"])
def cve():
    print(cve_request())
    return render_template("cve.html",cves=cve_request())

@app.route("/util")
def util():
    return test()




app.run(host='0.0.0.0',port=80)
