@echo off
setlocal

set "KEY_PATH=%~dp0infos\lighter.pem"
set "USER_ACCOUNT=%USERDOMAIN%\%USERNAME%"

if not exist "%KEY_PATH%" (
  echo ERROR: SSH key not found:
  echo   %KEY_PATH%
  echo.
  pause
  exit /b 1
)

echo Locking SSH key permissions for:
echo   %KEY_PATH%
echo.
echo Current user:
echo   %USER_ACCOUNT%
echo.

icacls "%KEY_PATH%" /inheritance:r >nul
if errorlevel 1 (
  echo ERROR: Failed to disable inherited permissions.
  echo.
  pause
  exit /b 1
)

icacls "%KEY_PATH%" /remove:g "Everyone" "BUILTIN\Users" "Authenticated Users" "Users" >nul 2>nul
icacls "%KEY_PATH%" /grant:r "%USER_ACCOUNT%:(R)" >nul

if errorlevel 1 (
  echo ERROR: Failed while granting read permission to %USER_ACCOUNT%.
  echo.
  pause
  exit /b 1
)

echo.
echo Final permissions:
icacls "%KEY_PATH%"

echo.
echo Test with:
echo   ssh -i "%KEY_PATH%" -o IdentitiesOnly=yes ubuntu@^<your-vps-host^>

echo.
pause
endlocal
