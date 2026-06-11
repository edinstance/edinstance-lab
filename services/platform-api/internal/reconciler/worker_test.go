package reconciler

import (
	"testing"
	"time"
)

func TestRetryDelay(t *testing.T) {
	tests := []struct {
		attempts int
		want     time.Duration
	}{
		{attempts: 0, want: 2 * time.Second},
		{attempts: 1, want: 2 * time.Second},
		{attempts: 2, want: 4 * time.Second},
		{attempts: 8, want: 256 * time.Second},
		{attempts: 20, want: 256 * time.Second},
	}
	for _, test := range tests {
		if got := retryDelay(test.attempts); got != test.want {
			t.Fatalf("retryDelay(%d) = %s, want %s", test.attempts, got, test.want)
		}
	}
}
