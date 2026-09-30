//go:build !windows && !darwin

package main

import "os/exec"

func installIfNeeded() bool { return false }
func uninstall()            {}

func openBrowser(url string) { _ = exec.Command("xdg-open", url).Start() }
