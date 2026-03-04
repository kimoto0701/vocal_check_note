@echo off
chcp 65001 > nul
echo ===================================================
echo  歌みたチェックノート (Vocal Check Note) 起動サーバー
echo ===================================================
echo.
echo YouTubeの公式MVなどは、セキュリティ保護のため
echo 直接ダブルクリック（file://）で開くと「エラー153」が出ます。
echo.
echo それを回避するため、ローカルサーバーを起動してブラウザを開きます...
echo.

:: npxがインストールされているか（Node.js環境）確認
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js環境が見つかりました。起動します...
    start http://127.0.0.1:8080
    npx --yes http-server -p 8080 -c-1
    pause
    exit
)

:: Pythonがインストールされているか確認
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Python環境が見つかりました。起動します...
    start http://127.0.0.1:8000
    python -m http.server 8000
    pause
    exit
)

echo [エラー] Node.js も Python も見つかりませんでした。
echo エラー153を防ぐには、サーバー経由（VSCodeのLive Server等）で起動してください。
pause
