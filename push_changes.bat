@echo off
cd /d C:\Users\Dell\Documents\fixrly-app\fixrlyapp
REM Stage all changes
git add -A
REM Commit with message; if no changes, continue
git commit -m "Admin: improve SettingsTab UX - validation and loading" || echo No changes to commit
REM Push current HEAD to origin
git push origin HEAD
pause
