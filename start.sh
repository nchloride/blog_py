#!/bin/bash

ip=$1

if [[ $ip -eq "" ]] 
then
	echo -e "positional arguments required: \n $0 <ip_add>";
	exit 1;
fi





