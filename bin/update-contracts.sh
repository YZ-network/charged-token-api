#!/bin/bash

PROJECT_DIR=$PWD

INSTALLED_API_VERSION=$(git log --name-status HEAD^..HEAD | grep commit | awk '{print $2}')
INSTALLED_CT_VERSION=$(npm ls charged-token-contracts | grep github | sed 's/^.*#\(.*\)).*$/\1/')

echo
echo "[$(date -Iseconds)] (BOT) Updating project ========================================"
echo

git pull
[ $? != 0 ] && exit 1

API_VERSION=$(git log --name-status HEAD^..HEAD | grep commit | awk '{print $2}')

echo
echo "[$(date -Iseconds)] (BOT) Pulling last contracts =================================="
echo

npm i charged-token-contracts
[ $? != 0 ] && exit 2

CT_VERSION=$(npm ls charged-token-contracts | grep github | sed 's/^.*#\(.*\)).*$/\1/')

if [ $CT_VERSION == $INSTALLED_CT_VERSION -a $API_VERSION == $INSTALLED_API_VERSION ]
then
  echo
  echo "[$(date -Iseconds)] (BOT) Nothing changed, nothing to do ======================"
  echo

  git restore package-lock.json
  exit 0
fi

echo
echo "[$(date -Iseconds)] (BOT) Contracts version ${CT_VERSION} ==============="
echo "[$(date -Iseconds)] (BOT) Preparing build environment ============================="
echo

cd node_modules/charged-token-contracts
npm i
[ $? != 0 ] && exit 3

echo
echo "[$(date -Iseconds)] (BOT) Compiling contracts ====================================="
echo

npm run build
[ $? != 0 ] && exit 4

cp $(ls build/*.json | grep -vE 'contracts|realInput|ProjectToken|Set|SafeMath') ../../src/contracts
[ $? != 0 ] && exit 5

if [ ! -z $INSTALL_DIR ]
then
  echo
  echo "[$(date -Iseconds)] (BOT) Updating api to ${API_VERSION} ======================="
  echo

  npm run build
  [ $? != 0 ] && exit 6

  rm -rf $INSTALL_DIR
  [ $? != 0 ] && exit 7

  mkdir $INSTALL_DIR
  [ $? != 0 ] && exit 8

  cp -Rv build/* $INSTALL_DIR
  [ $? != 0 ] && exit 9
fi

cd $PROJECT_DIR

echo
echo "[$(date -Iseconds)] (BOT) Updating repository ====================================="
echo

git commit -am "[BOT] Updated dapp to contracts ${CT_VERSION}" && git push
[ $? != 0 ] && exit 10

echo
echo "[$(date -Iseconds)] (BOT) Contracts updated ! ====================================="
echo
