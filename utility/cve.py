from bs4 import BeautifulSoup
import requests


def cve_request():
    hreflinks = []
    url = "https://thehackernews.com/search/label/Vulnerability"
    res = requests.get(url)
    soup = BeautifulSoup(res.text,"html.parser")
    cve = soup.find(class_="blog-posts clear")
    for link in cve.find_all(class_="story-link"):
        story = {
            "link":link.get("href"),
            "title":link.find(class_="home-title").text,
        }
        hreflinks.append(story)
    return hreflinks

