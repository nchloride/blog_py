FROM python:3.12-alpine

WORKDIR /app
COPY . /app

RUN apk update

RUN adduser -G www-data -S www-data

RUN chown www-data:www-data /app 

USER www-data

ENV user=admin
ENV pass=pass123

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 80

CMD ["python3","main.py"]
