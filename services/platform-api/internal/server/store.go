package server

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

func (s *Server) listAppsFromDB() ([]App, error) {
	rows, err := s.db.Query(`
		select
			name,
			image,
			port,
			replicas,
			status,
			updated_at
		from services
		order by name asc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	apps := []App{}
	for rows.Next() {
		var app App
		var updatedAt time.Time
		if err := rows.Scan(&app.Name, &app.Image, &app.Port, &app.Replicas, &app.Status, &updatedAt); err != nil {
			return nil, err
		}
		app.Ready = app.Status == "ready"
		app.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
		app.Domains, err = s.listDomainsForApp(app.Name)
		if err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}
	return apps, rows.Err()
}

func (s *Server) insertApp(req CreateAppRequest) (App, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return App{}, fmt.Errorf("begin create app: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	serviceID := uuid.NewString()
	var updatedAt time.Time
	if err := tx.QueryRow(`
		insert into services (id, name, image, port, replicas, status)
		values ($1::uuid, $2, $3, $4, $5, 'pending')
		returning updated_at
	`, serviceID, req.Name, req.Image, req.Port, req.Replicas).Scan(&updatedAt); err != nil {
		return App{}, fmt.Errorf("insert service: %w", err)
	}

	for _, hostname := range req.Domains {
		if _, err := tx.Exec(`
			insert into service_domains (id, service_id, hostname, scope)
			values ($1::uuid, $2::uuid, $3, $4)
		`, uuid.NewString(), serviceID, hostname, domainScope(hostname)); err != nil {
			return App{}, fmt.Errorf("insert service domain %s: %w", hostname, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return App{}, fmt.Errorf("commit create app: %w", err)
	}

	domains := make([]Domain, 0, len(req.Domains))
	for _, hostname := range req.Domains {
		domains = append(domains, Domain{
			Host:   hostname,
			Scope:  domainScope(hostname),
			Status: "configured",
		})
	}
	return App{
		Name:      req.Name,
		Image:     req.Image,
		Status:    "pending",
		Ready:     false,
		Replicas:  req.Replicas,
		Port:      req.Port,
		Domains:   domains,
		UpdatedAt: updatedAt.UTC().Format(time.RFC3339),
	}, nil
}

func (s *Server) getAppFromDB(name string) (App, error) {
	var app App
	var updatedAt time.Time
	err := s.db.QueryRow(`
		select
			name,
			image,
			port,
			replicas,
			status,
			updated_at
		from services
		where name = $1
	`, name).Scan(&app.Name, &app.Image, &app.Port, &app.Replicas, &app.Status, &updatedAt)
	if err != nil {
		return App{}, err
	}
	app.Ready = app.Status == "ready"
	app.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	app.Domains, err = s.listDomainsForApp(app.Name)
	if err != nil {
		return App{}, err
	}
	return app, nil
}

func (s *Server) listDomainsForApp(name string) ([]Domain, error) {
	rows, err := s.db.Query(`
		select
			service_domains.hostname,
			service_domains.scope
		from service_domains
		join services on services.id = service_domains.service_id
		where services.name = $1
		order by service_domains.hostname asc
	`, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	domains := []Domain{}
	for rows.Next() {
		var domain Domain
		if err := rows.Scan(&domain.Host, &domain.Scope); err != nil {
			return nil, err
		}
		domain.Status = "configured"
		domains = append(domains, domain)
	}
	return domains, rows.Err()
}

func (s *Server) serviceIDByName(name string) (string, error) {
	var serviceID string
	err := s.db.QueryRow("select id::text from services where name = $1", name).Scan(&serviceID)
	return serviceID, err
}

func (s *Server) upsertEnvVar(serviceID string, name string, encryptedValue string) error {
	_, err := s.db.Exec(`
		insert into service_env_vars (id, service_id, name, value_encrypted, is_secret)
		values ($1::uuid, $2::uuid, $3, $4, true)
		on conflict (service_id, name)
		do update set
			value_encrypted = excluded.value_encrypted,
			is_secret = true,
			updated_at = now()
	`, uuid.NewString(), serviceID, name, encryptedValue)
	if err != nil {
		return fmt.Errorf("upsert env var %s: %w", name, err)
	}
	return nil
}
