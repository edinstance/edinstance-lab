package envfile

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

type Variable struct {
	Name  string
	Value string
}

func Parse(content string) ([]Variable, error) {
	scanner := bufio.NewScanner(strings.NewReader(content))
	vars := []Variable{}
	seen := map[string]int{}

	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")

		name, value, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("line %d: missing '='", lineNumber)
		}
		name = strings.TrimSpace(name)
		if !ValidName(name) {
			return nil, fmt.Errorf("line %d: invalid env var name %q", lineNumber, name)
		}
		value = strings.TrimSpace(value)
		value = unquote(value)

		if index, exists := seen[name]; exists {
			vars[index].Value = value
			continue
		}
		seen[name] = len(vars)
		vars = append(vars, Variable{Name: name, Value: value})
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan env file: %w", err)
	}
	return vars, nil
}

func ValidName(name string) bool {
	if name == "" {
		return false
	}
	for i, r := range name {
		if i == 0 {
			if r != '_' && !unicode.IsLetter(r) {
				return false
			}
			continue
		}
		if r != '_' && !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

func unquote(value string) string {
	if len(value) < 2 {
		return value
	}
	if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
		unquoted, err := strconv.Unquote(value)
		if err == nil {
			return unquoted
		}
		return value[1 : len(value)-1]
	}
	return value
}
