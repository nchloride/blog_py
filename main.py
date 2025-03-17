from flask import *
from pymongo import MongoClient
import json
import os
import urllib.parse
from bson import json_util
app = Flask(__name__)
notes=[]


user = urllib.parse.quote_plus(os.environ['user'])
password = urllib.parse.quote_plus(os.environ['pass'])

mongoUri = f"mongodb://{user}:{password}@192.168.100.114:27017/blog?authSource=admin"
client = MongoClient(mongoUri)
db = client['blog']
notes_collection = db.get_collection("notes")

def parse_json(data):
    return json.loads(json_util.dumps(data))

@app.route("/")
def home():
    print(list(notes_collection.find()))

    data = list(notes_collection.find())
    if len(data) != 0:
        return render_template("home.html",notes=data)
    client.close()
    return "<h1>HELLO THERE</h1>"

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


@app.route("/api/cve")
def cve():
    # todo cve scrapper

app.run(host='0.0.0.0',port=8080)
