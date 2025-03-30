FROM python:3.12-alpine

WORKDIR /app

COPY . /app

RUN pip install --no-cache-dir flask pymongo requests beautifulsoup4 

EXPOSE 8080

CMD ["python3","main.py"]
