// Rutapp Impresora: agente local que recibe bytes ESC/POS desde rutapp.mx
// y los envía en RAW a una impresora instalada en el sistema (USB/cable/red).
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	Version  = "1.0.0"
	Addr     = "127.0.0.1:17777"
	AppName  = "RutappImpresora"
	UIURL    = "http://" + Addr + "/"
	maxBytes = 5 << 20
)

type Config struct {
	Printer string `json:"printer"`
	Ancho   string `json:"ancho"` // "58" | "80"
}

var (
	cfgMu sync.Mutex
	cfg   = Config{Ancho: "80"}
)

var allowedOrigin = regexp.MustCompile(`^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://([a-z0-9-]+\.)*(rutapp\.mx|lovable\.app|lovableproject\.com)$`)

func configDir() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	p := filepath.Join(d, AppName)
	_ = os.MkdirAll(p, 0o755)
	return p
}

func loadConfig() {
	b, err := os.ReadFile(filepath.Join(configDir(), "config.json"))
	if err != nil {
		return
	}
	var c Config
	if json.Unmarshal(b, &c) == nil {
		if c.Ancho != "58" && c.Ancho != "80" {
			c.Ancho = "80"
		}
		cfg = c
	}
}

func saveConfig(c Config) error {
	b, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(filepath.Join(configDir(), "config.json"), b, 0o644)
}

func getCfg() Config {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	return cfg
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !allowedOrigin.MatchString(origin) {
				writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "origen no permitido"})
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	c := getCfg()
	writeJSON(w, 200, map[string]any{"ok": true, "version": Version, "printer": c.Printer, "ancho": c.Ancho})
}

func handlePrinters(w http.ResponseWriter, r *http.Request) {
	list, err := listPrinters()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "printers": list, "default": defaultPrinter()})
}

func handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		writeJSON(w, 200, getCfg())
		return
	}
	var c Config
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&c); err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "json inválido"})
		return
	}
	if c.Ancho != "58" && c.Ancho != "80" {
		c.Ancho = "80"
	}
	cfgMu.Lock()
	cfg = c
	cfgMu.Unlock()
	if err := saveConfig(c); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "printer": c.Printer, "ancho": c.Ancho})
}

func targetPrinter(p string) (string, error) {
	if p == "" {
		p = getCfg().Printer
	}
	if p == "" {
		p = defaultPrinter()
	}
	if p == "" {
		return "", errors.New("no hay impresora configurada")
	}
	return p, nil
}

func handlePrint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"ok": false, "error": "usa POST"})
		return
	}
	var body struct {
		Data    string `json:"data"` // base64 ESC/POS
		Printer string `json:"printer"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBytes)).Decode(&body); err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "json inválido"})
		return
	}
	data, err := base64.StdEncoding.DecodeString(body.Data)
	if err != nil || len(data) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "data base64 inválida"})
		return
	}
	printer, err := targetPrinter(body.Printer)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := printRaw(printer, data); err != nil {
		log.Printf("print error (%s): %v", printer, err)
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "printer": printer})
}

func handleTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"ok": false, "error": "usa POST"})
		return
	}
	var body Config
	_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
	c := getCfg()
	if body.Printer != "" {
		c.Printer = body.Printer
	}
	if body.Ancho == "58" || body.Ancho == "80" {
		c.Ancho = body.Ancho
	}
	printer, err := targetPrinter(c.Printer)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := printRaw(printer, testTicket(c.Ancho, printer)); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "printer": printer})
}

func testTicket(ancho, printer string) []byte {
	cols := 48
	if ancho == "58" {
		cols = 32
	}
	line := strings.Repeat("-", cols) + "\n"
	var b []byte
	b = append(b, 0x1B, 0x40)       // init
	b = append(b, 0x1B, 0x61, 0x01) // center
	b = append(b, 0x1D, 0x21, 0x11) // doble
	b = append(b, "RUTAPP\n"...)
	b = append(b, 0x1D, 0x21, 0x00)
	b = append(b, "Prueba de impresion\n"...)
	b = append(b, line...)
	b = append(b, 0x1B, 0x61, 0x00) // left
	b = append(b, fmt.Sprintf("Impresora: %s\n", printer)...)
	b = append(b, fmt.Sprintf("Ancho: %s mm (%d col)\n", ancho, cols)...)
	b = append(b, fmt.Sprintf("Fecha: %s\n", time.Now().Format("02/01/2006 15:04:05"))...)
	b = append(b, fmt.Sprintf("Agente: v%s\n", Version)...)
	b = append(b, line...)
	num := ""
	for i := 0; i < cols; i++ {
		num += fmt.Sprint(i % 10)
	}
	b = append(b, num+"\n"...)
	b = append(b, line...)
	b = append(b, 0x1B, 0x61, 0x01)
	b = append(b, "Si ves esto, todo funciona\n\n\n\n"...)
	b = append(b, 0x1D, 0x56, 0x42, 0x00) // cut
	return b
}

func handleUI(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.WriteString(w, uiHTML)
}

func handleUninstall(w http.ResponseWriter, r *http.Request) {
	// Solo desde la página local del agente.
	if r.Method != http.MethodPost || r.Header.Get("Origin") != "http://"+Addr {
		writeJSON(w, 403, map[string]any{"ok": false})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
	go func() {
		time.Sleep(300 * time.Millisecond)
		uninstall()
		os.Exit(0)
	}()
}

func main() {
	logf, _ := os.OpenFile(filepath.Join(configDir(), "agent.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if logf != nil {
		log.SetOutput(logf)
	}

	background := false
	for _, a := range os.Args[1:] {
		switch a {
		case "--uninstall", "/uninstall":
			uninstall()
			return
		case "--background":
			background = true
		}
	}

	// Primera ejecución desde Descargas: se copia, se registra al inicio y relanza.
	if installIfNeeded() {
		return
	}

	ln, err := net.Listen("tcp", Addr)
	if err != nil {
		// Ya hay una instancia corriendo: solo abre la configuración.
		if !background {
			openBrowser(UIURL)
		}
		return
	}

	loadConfig()
	log.Printf("Rutapp Impresora v%s escuchando en %s", Version, Addr)

	mux := http.NewServeMux()
	mux.HandleFunc("/", handleUI)
	mux.HandleFunc("/status", cors(handleStatus))
	mux.HandleFunc("/printers", cors(handlePrinters))
	mux.HandleFunc("/config", cors(handleConfig))
	mux.HandleFunc("/print", cors(handlePrint))
	mux.HandleFunc("/test", cors(handleTest))
	mux.HandleFunc("/uninstall", handleUninstall)

	if !background {
		go func() {
			time.Sleep(400 * time.Millisecond)
			openBrowser(UIURL)
		}()
	}

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.Serve(ln))
}
