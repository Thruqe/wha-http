package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog"
)

const (
	reset  = "\x1b[0m"
	bold   = "\x1b[1m"
	green  = "\x1b[32m"
	yellow = "\x1b[33m"
	red    = "\x1b[31m"
	gray   = "\x1b[90m"
	white  = "\x1b[37m"
)

type customWriter struct{}

func (w customWriter) Write(p []byte) (n int, err error) {
	var ev map[string]any
	if err := json.Unmarshal(p, &ev); err != nil {
		return os.Stdout.Write(p)
	}

	// Parse time
	tStr, _ := ev[zerolog.TimestampFieldName].(string)
	t, err := time.Parse(time.RFC3339, tStr)
	if err != nil {
		t = time.Now()
	}
	tFormatted := t.Format("15:04:05")

	// Parse level
	levelStr, _ := ev[zerolog.LevelFieldName].(string)

	// Match colors and labels
	var label, color string
	var isStderr bool
	switch levelStr {
	case "trace":
		label, color, isStderr = "TRACE", gray, false
	case "debug":
		label, color, isStderr = "DEBUG", "\x1b[34m", false
	case "info":
		label, color, isStderr = "INFO ", green, false
	case "warn":
		label, color, isStderr = "WARN ", yellow, false
	case "error":
		label, color, isStderr = "ERROR", red, true
	default:
		label, color, isStderr = "INFO ", green, false
	}

	msg, _ := ev[zerolog.MessageFieldName].(string)

	line := fmt.Sprintf(
		"%s%s%s %s%s%s%s (wha-http)%s: %s%s%s\n",
		gray, tFormatted, reset,
		color, bold, label, reset,
		reset,
		white, msg, reset,
	)

	if isStderr {
		os.Stderr.WriteString(line)
	} else {
		os.Stdout.WriteString(line)
	}
	return len(p), nil
}

var logger zerolog.Logger

func init() {
	zerolog.TimeFieldFormat = time.RFC3339
	zerolog.SetGlobalLevel(zerolog.TraceLevel)
	logger = zerolog.New(customWriter{}).With().Timestamp().Logger()
}

func Trace(msg string, args ...any) { logger.Trace().Msgf(msg, args...) }
func Debug(msg string, args ...any) { logger.Debug().Msgf(msg, args...) }
func Info(msg string, args ...any)  { logger.Info().Msgf(msg, args...) }
func Warn(msg string, args ...any)  { logger.Warn().Msgf(msg, args...) }
func Error(msg string, args ...any) { logger.Error().Msgf(msg, args...) }

func writeObj(level zerolog.Level, obj any, msg string) {
	b, _ := json.Marshal(obj)
	logger.WithLevel(level).Msgf("%s %s", msg, string(b))
}

func TraceObj(obj any, msg string) { writeObj(zerolog.TraceLevel, obj, msg) }
func InfoObj(obj any, msg string)  { writeObj(zerolog.InfoLevel, obj, msg) }
func ErrorObj(obj any, msg string) { writeObj(zerolog.ErrorLevel, obj, msg) }
