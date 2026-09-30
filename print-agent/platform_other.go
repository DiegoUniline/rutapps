//go:build !windows

package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

func listPrinters() ([]string, error) {
	out, err := exec.Command("lpstat", "-e").Output()
	if err != nil {
		return []string{}, nil
	}
	var list []string
	for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			list = append(list, l)
		}
	}
	return list, nil
}

func defaultPrinter() string {
	out, err := exec.Command("lpstat", "-d").Output()
	if err != nil {
		return ""
	}
	s := string(out)
	if i := strings.LastIndex(s, ":"); i >= 0 {
		return strings.TrimSpace(s[i+1:])
	}
	return ""
}

func printRaw(printer string, data []byte) error {
	cmd := exec.Command("lp", "-d", printer, "-o", "raw")
	cmd.Stdin = bytes.NewReader(data)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("lp: %v %s", err, out)
	}
	return nil
}

func installIfNeeded() bool { return false }
func uninstall()            {}

func openBrowser(url string) {
	if runtime.GOOS == "darwin" {
		_ = exec.Command("open", url).Start()
		return
	}
	_ = exec.Command("xdg-open", url).Start()
}
