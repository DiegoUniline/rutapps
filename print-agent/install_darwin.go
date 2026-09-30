//go:build darwin

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const launchLabel = "mx.rutapp.impresora"

func home() string { h, _ := os.UserHomeDir(); return h }

func plistPath() string {
	return filepath.Join(home(), "Library", "LaunchAgents", launchLabel+".plist")
}

func installedApp() string {
	return filepath.Join(home(), "Applications", "Rutapp Impresora.app")
}

// bundleOf devuelve la ruta del .app si el ejecutable vive en Contents/MacOS.
func bundleOf(exe string) string {
	macos := filepath.Dir(exe)
	contents := filepath.Dir(macos)
	app := filepath.Dir(contents)
	if filepath.Base(macos) == "MacOS" && filepath.Base(contents) == "Contents" && strings.HasSuffix(app, ".app") {
		return app
	}
	return ""
}

func uid() string { return fmt.Sprint(os.Getuid()) }

func writePlist(exe string) error {
	_ = os.MkdirAll(filepath.Dir(plistPath()), 0o755)
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key><array><string>%s</string><string>--background</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
`, launchLabel, exe)
	return os.WriteFile(plistPath(), []byte(plist), 0o644)
}

func stopAgent() {
	_ = exec.Command("launchctl", "bootout", "gui/"+uid()+"/"+launchLabel).Run()
}

// installIfNeeded copia el .app a ~/Applications, registra un LaunchAgent
// (arranca al iniciar sesión) y lo inicia. Devuelve true si hay que salir.
func installIfNeeded() bool {
	self, err := os.Executable()
	if err != nil {
		return false
	}
	self, _ = filepath.EvalSymlinks(self)
	app := bundleOf(self)
	if app == "" {
		return false // binario suelto (desarrollo)
	}
	dst := installedApp()
	if app == dst {
		return false
	}
	stopAgent()
	_ = os.MkdirAll(filepath.Dir(dst), 0o755)
	_ = os.RemoveAll(dst)
	if out, err := exec.Command("ditto", app, dst).CombinedOutput(); err != nil {
		log.Printf("install copy failed: %v %s", err, out)
		return false
	}
	exe := filepath.Join(dst, "Contents", "MacOS", filepath.Base(self))
	if err := writePlist(exe); err != nil {
		log.Printf("plist failed: %v", err)
		return false
	}
	if out, err := exec.Command("launchctl", "bootstrap", "gui/"+uid(), plistPath()).CombinedOutput(); err != nil {
		log.Printf("launchctl bootstrap: %v %s", err, out)
		if err := exec.Command(exe, "--background").Start(); err != nil {
			return false
		}
	}
	time.Sleep(time.Second)
	openBrowser(UIURL)
	return true
}

func uninstall() {
	_ = os.Remove(plistPath())
	_ = os.RemoveAll(installedApp())
	stopAgent() // termina este mismo proceso si corre bajo launchd
}

func openBrowser(url string) { _ = exec.Command("open", url).Start() }
