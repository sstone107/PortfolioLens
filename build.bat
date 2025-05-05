@echo off
echo [PortfolioLens Build Script]

:: Kill any running instances of the app
echo Stopping any running instances...

:: Method 1: Kill by port (more targeted)
echo Method 1: Killing processes using port 5200...
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":5200" ^| findstr "LISTENING"') DO (
    echo Found process: %%P
    taskkill /F /PID %%P 2>nul
    if %errorlevel% equ 0 (
        echo Successfully terminated process %%P
    )
)

:: Method 2: Kill node processes containing vite (dev server)
echo Method 2: Killing Vite/Node.js processes...
FOR /F "tokens=2" %%P IN ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr /I "vite"') DO (
    echo Found node process: %%P
    taskkill /F /PID %%P 2>nul
    if %errorlevel% equ 0 (
        echo Successfully terminated node process %%P
    )
)

:: Wait a moment to ensure processes are terminated
echo Waiting for processes to terminate...
timeout /t 2 /nobreak > nul

:: Install dependencies if node_modules doesn't exist
if not exist "PortfolioLens\node_modules\" (
    echo Installing dependencies...
    cd PortfolioLens
    call npm install
    cd ..
) else (
    echo Dependencies already installed.
)

:: Start the app in development mode
echo Starting the application...
cd PortfolioLens
start cmd /k "title PortfolioLens Dev Server && npm run dev -- --port=5200"

echo Build script completed.
