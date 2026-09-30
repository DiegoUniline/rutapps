//go:build windows

package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const runKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

func hidden(name string, args ...string) *exec.Cmd {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

func installDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = configDir()
	}
	return filepath.Join(base, AppName)
}

func installPath() string { return filepath.Join(installDir(), AppName+".exe") }

func shortcutPath() string {
	return filepath.Join(os.Getenv("APPDATA"), `Microsoft\Windows\Start Menu\Programs`, "Rutapp Impresora.lnk")
}

func killOthers() {
	_ = hidden("taskkill", "/F", "/IM", AppName+".exe", "/FI", fmt.Sprintf("PID ne %d", os.Getpid())).Run()
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// installIfNeeded copia el exe a %LOCALAPPDATA%, lo registra al iniciar sesión,
// crea acceso directo y lanza la copia instalada. Devuelve true si hay que salir.
func installIfNeeded() bool {
	self, err := os.Executable()
	if err != nil {
		return false
	}
	dst := installPath()
	if strings.EqualFold(filepath.Clean(self), filepath.Clean(dst)) {
		return false
	}
	_ = os.MkdirAll(installDir(), 0o755)
	killOthers()
	var cerr error
	for i := 0; i < 5; i++ {
		if cerr = copyFile(self, dst); cerr == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if cerr != nil {
		log.Printf("install copy failed: %v", cerr)
		return false // corre desde donde esté
	}
	_ = hidden("reg", "add", runKey, "/v", AppName, "/t", "REG_SZ", "/d", fmt.Sprintf(`"%s" --background`, dst), "/f").Run()
	ps := fmt.Sprintf(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';$s.Save()`,
		strings.ReplaceAll(shortcutPath(), "'", "''"), strings.ReplaceAll(dst, "'", "''"))
	_ = hidden("powershell", "-NoProfile", "-NonInteractive", "-Command", ps).Run()
	if err := hidden(dst).Start(); err != nil {
		log.Printf("launch installed failed: %v", err)
		return false
	}
	return true
}

func uninstall() {
	killOthers()
	_ = hidden("reg", "delete", runKey, "/v", AppName, "/f").Run()
	_ = os.Remove(shortcutPath())
	_ = hidden("cmd", "/C", fmt.Sprintf(`timeout /T 2 /NOBREAK >NUL & rmdir /S /Q "%s"`, installDir())).Start()
}

func openBrowser(url string) {
	_ = hidden("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
