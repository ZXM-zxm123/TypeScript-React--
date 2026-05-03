package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type ExecuteRequest struct {
	Code     string `json:"code"`
	Language string `json:"language"`
	Input    string `json:"input"`
}

type ExecuteResponse struct {
	Success bool   `json:"success"`
	Output  string `json:"output"`
	Error   string `json:"error,omitempty"`
	Time    int64  `json:"time"`
}

var tempDir string

func init() {
	var err error
	tempDir = filepath.Join(os.TempDir(), "interview-exec")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		log.Fatalf("Failed to create temp dir: %v", err)
	}
}

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/execute", handleExecute)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	log.Println("Code execution service running on port 4001")
	if err := r.Run(":4001"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func handleExecute(c *gin.Context) {
	var req ExecuteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ExecuteResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	start := time.Now()

	switch strings.ToLower(req.Language) {
	case "javascript", "js":
		output, err := executeJavaScript(req.Code, req.Input)
		c.JSON(http.StatusOK, ExecuteResponse{
			Success: err == nil,
			Output:  output,
			Error:   errString(err),
			Time:    time.Since(start).Milliseconds(),
		})
	case "python", "py":
		output, err := executePython(req.Code, req.Input)
		c.JSON(http.StatusOK, ExecuteResponse{
			Success: err == nil,
			Output:  output,
			Error:   errString(err),
			Time:    time.Since(start).Milliseconds(),
		})
	default:
		c.JSON(http.StatusBadRequest, ExecuteResponse{
			Success: false,
			Error:   fmt.Sprintf("Unsupported language: %s", req.Language),
		})
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func executeJavaScript(code, input string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filename := filepath.Join(tempDir, fmt.Sprintf("exec_%d.js", time.Now().UnixNano()))
	defer os.Remove(filename)

	if err := os.WriteFile(filename, []byte(code), 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	cmd := exec.CommandContext(ctx, "node", filename)
	if input != "" {
		cmd.Stdin = strings.NewReader(input)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("execution timeout")
		}
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		return stdout.String(), fmt.Errorf(errMsg)
	}

	return stdout.String(), nil
}

func executePython(code, input string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filename := filepath.Join(tempDir, fmt.Sprintf("exec_%d.py", time.Now().UnixNano()))
	defer os.Remove(filename)

	if err := os.WriteFile(filename, []byte(code), 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	var pythonCmd string
	if runtime.GOOS == "windows" {
		pythonCmd = "python"
	} else {
		pythonCmd = "python3"
	}

	cmd := exec.CommandContext(ctx, pythonCmd, filename)
	if input != "" {
		cmd.Stdin = strings.NewReader(input)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("execution timeout")
		}
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		return stdout.String(), fmt.Errorf(errMsg)
	}

	return stdout.String(), nil
}
