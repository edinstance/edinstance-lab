package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

type Cipher struct {
	gcm cipher.AEAD
}

func NewCipher(encodedKey string) (*Cipher, error) {
	key, err := decodeKey(encodedKey)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create AES cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM cipher: %w", err)
	}
	return &Cipher{gcm: gcm}, nil
}

func (c *Cipher) Encrypt(plaintext string) (string, error) {
	nonce := make([]byte, c.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	ciphertext := c.gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (c *Cipher) Decrypt(encodedCiphertext string) (string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(encodedCiphertext)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}
	if len(ciphertext) < c.gcm.NonceSize() {
		return "", errors.New("ciphertext is too short")
	}
	nonce := ciphertext[:c.gcm.NonceSize()]
	body := ciphertext[c.gcm.NonceSize():]
	plaintext, err := c.gcm.Open(nil, nonce, body, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt ciphertext: %w", err)
	}
	return string(plaintext), nil
}

func decodeKey(encodedKey string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("encryption key must be valid base64 yielding 16, 24, or 32 bytes: %w", err)
	}
	switch len(key) {
	case 16, 24, 32:
		return key, nil
	default:
		return nil, fmt.Errorf("encryption key must be valid base64 yielding 16, 24, or 32 bytes, got %d bytes", len(key))
	}
}
