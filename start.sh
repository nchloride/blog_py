#!/bin/bash

ip=$1

if [[ $ip -eq "" ]] 
then
	echo -e "positional arguments required: \n $0 <ip_add>";
	exit 1;
fi


sed -e "s/ip = \"<ip_add>\"/ip = \"${ip}\"/g" main.py > main2.py


export user=admin
export pass=pass123

python3 main2.py
