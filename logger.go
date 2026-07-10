package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

const (
	reset   = "\x1b[0m"
	bold    = "\x1b[1m"
	cyan    = "\x1b[36m"
	green   = "\x1b[32m"
	yellow  = "\x1b[33m"
	red     = "\x1b[31m"
	magenta = "\x1b[35m"
	gray    = "\x1b[90m"
	white   = "\x1b[37m"
)

type Level int

const (
	LevelTrace Level = iota
	LevelDebug
	LevelInfo
	LevelWarn
	LevelError
)

var current = LevelTrace

type entry struct {
	level  Level
	label  string
	color  string
	stderr bool
}

var levels = map[Level]entry{
	LevelTrace: {LevelTrace, "TRACE", gray, false},
	LevelDebug: {LevelDebug, "DEBUG", "\x1b[34m", false},
	LevelInfo:  {LevelInfo, "INFO ", green, false},
	LevelWarn:  {LevelWarn, "WARN ", yellow, false},
	LevelError: {LevelError, "ERROR", red, true},
}

func write(l Level, msg string, args ...any) {
	if l < current {
		return
	}
	e := levels[l]
	t := time.Now().Format("15:04:05")
	line := fmt.Sprintf(
		"%s%s%s %s%s%s%s (wha-http)%s: %s%s%s\n",
		gray, t, reset,
		e.color, bold, e.label, reset,
		reset,
		white, fmt.Sprintf(msg, args...), reset,
	)
	if e.stderr {
		os.Stderr.WriteString(line)
	} else {
		os.Stdout.WriteString(line)
	}
}

func writeObj(l Level, obj any, msg string) {
	b, _ := json.Marshal(obj)
	write(l, "%s %s", msg, string(b))
}

func Trace(msg string, args ...any) { write(LevelTrace, msg, args...) }
func Debug(msg string, args ...any) { write(LevelDebug, msg, args...) }
func Info(msg string, args ...any)  { write(LevelInfo, msg, args...) }
func Warn(msg string, args ...any)  { write(LevelWarn, msg, args...) }
func Error(msg string, args ...any) { write(LevelError, msg, args...) }

func TraceObj(obj any, msg string) { writeObj(LevelTrace, obj, msg) }
func InfoObj(obj any, msg string)  { writeObj(LevelInfo, obj, msg) }
func ErrorObj(obj any, msg string) { writeObj(LevelError, obj, msg) }
