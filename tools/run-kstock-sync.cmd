@echo off
setlocal
cd /d C:\Users\user\snake-web-prototype
set FIREBASE_SERVICE_ACCOUNT_PATH=C:\Users\user\secgameworld2-firebase-adminsdk-fbsvc-9e33a0b60d.json
call npm run sync:kstock
