package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	platformauth "github.com/edinstance/edinstance-lab/services/platform-api/internal/auth"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/config"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/platformdb"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/reconciler"
	platformsecrets "github.com/edinstance/edinstance-lab/services/platform-api/internal/secrets"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/server"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/telemetry"
)

func main() {
	cfg := config.Load()
	logger := slog.New(telemetry.NewSpanHandler(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	}))).With("service", cfg.ServiceName)
	slog.SetDefault(logger)
	if err := cfg.Validate(); err != nil {
		logger.Error("invalid platform-api configuration", "error", err)
		os.Exit(1)
	}

	keyStore, err := platformauth.NewKeyStore(cfg.AuthJWKSURL)
	if err != nil {
		logger.Error("failed to configure auth JWKS keystore", "error", err)
		os.Exit(1)
	}

	shutdownTelemetry, err := telemetry.Init(context.Background(), cfg)
	if err != nil {
		logger.Error("failed to initialize OpenTelemetry", "error", err)
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownTelemetry(shutdownCtx); err != nil {
			logger.Warn("failed to shutdown OpenTelemetry", "error", err)
		}
	}()

	var secretCipher *platformsecrets.Cipher
	if cfg.PlatformEncryptionKey != "" {
		secretCipher, err = platformsecrets.NewCipher(cfg.PlatformEncryptionKey)
		if err != nil {
			logger.Error("invalid platform encryption key", "error", err)
			os.Exit(1)
		}
	} else {
		logger.Warn("PLATFORM_ENCRYPTION_KEY is not set; encrypted env storage is disabled")
	}

	var platformDatabase *platformdb.DB
	if cfg.DatabaseURL != "" {
		platformDatabase, err = platformdb.Open(context.Background(), cfg.DatabaseURL)
		if err != nil {
			logger.Error("failed to connect platform database", "error", err)
			os.Exit(1)
		}
		defer func() {
			if err := platformDatabase.Close(); err != nil {
				logger.Warn("failed to close platform database", "error", err)
			}
		}()
		if err := platformDatabase.Migrate(context.Background()); err != nil {
			logger.Error("failed to migrate platform database", "error", err)
			os.Exit(1)
		}
		logger.Info("platform database connected and migrated")
	} else {
		logger.Warn("PLATFORM_DATABASE_URL is not set; using in-memory app state")
	}

	var appReconciler *reconciler.Reconciler
	if cfg.ReconcileEnabled {
		appReconciler, err = reconciler.New(context.Background(), cfg, platformDatabase, secretCipher)
		if err != nil {
			logger.Error("failed to initialize Kubernetes reconciler", "error", err)
			os.Exit(1)
		}
		logger.Info("Kubernetes app reconciliation enabled", "namespace", cfg.AppsNamespace)
	} else {
		logger.Warn("PLATFORM_RECONCILE_ENABLED is not true; Kubernetes app reconciliation is disabled")
	}
	workerCtx, stopWorker := context.WithCancel(context.Background())
	workerDone := make(chan struct{})
	if appReconciler != nil {
		go func() {
			defer close(workerDone)
			if err := appReconciler.Run(workerCtx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("Kubernetes reconciliation worker stopped", "error", err)
			}
		}()
	} else {
		close(workerDone)
	}
	defer func() {
		stopWorker()
		<-workerDone
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(cfg, logger, platformDatabase, secretCipher, appReconciler, keyStore),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	if err := run(context.Background(), srv, logger); err != nil {
		logger.Error("platform-api stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, srv *http.Server, logger *slog.Logger) error {
	errCh := make(chan error, 1)
	go func() {
		logger.Info("platform-api listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(stop)

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	case sig := <-stop:
		logger.Info("shutdown signal received", "signal", sig.String())
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
