#!/bin/bash
# env
DIR="$( cd "$( dirname "$0" )" && pwd )"
cd $DIR

git pull

npm install

v=$(forever list | grep server)
if [[ -z $v ]]; then
  forever start server.js
else
  forever restartall
fi
