package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

func readEnvFileContent(r *http.Request) (string, error) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			return "", errors.New("invalid JSON body")
		}
		return body.Content, nil
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1024*1024))
	if err != nil {
		return "", errors.New("unable to read env file")
	}
	return string(body), nil
}
