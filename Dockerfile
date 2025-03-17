FROM python:alpine

WORKDIR /app

COPY . /app


RUN pip install flask pymongo


EXPOSE 8080

CMD ["python3","main.py"]
