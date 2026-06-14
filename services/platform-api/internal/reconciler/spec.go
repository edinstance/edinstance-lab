package reconciler

import (
	"context"
	"fmt"
)

func (r *Reconciler) loadAppSpec(ctx context.Context, name string) (AppSpec, error) {
	var spec AppSpec
	err := r.db.QueryRowContext(ctx, `
		select name, image, port, replicas, health_path
		from services
		where name = $1
	`, name).Scan(&spec.Name, &spec.Image, &spec.Port, &spec.Replicas, &spec.HealthPath)
	if err != nil {
		return AppSpec{}, fmt.Errorf("load app %s: %w", name, err)
	}

	domainRows, err := r.db.QueryContext(ctx, `
		select hostname
		from service_domains
		join services on services.id = service_domains.service_id
		where services.name = $1
		order by hostname asc
	`, name)
	if err != nil {
		return AppSpec{}, fmt.Errorf("load domains for %s: %w", name, err)
	}
	defer domainRows.Close()
	for domainRows.Next() {
		var hostname string
		if err := domainRows.Scan(&hostname); err != nil {
			return AppSpec{}, fmt.Errorf("scan domain row for %s: %w", name, err)
		}
		spec.Domains = append(spec.Domains, hostname)
	}
	if err := domainRows.Err(); err != nil {
		return AppSpec{}, fmt.Errorf("iterate domain rows for %s: %w", name, err)
	}

	spec.Env = map[string]string{}
	envRows, err := r.db.QueryContext(ctx, `
		select service_env_vars.name, service_env_vars.value_encrypted
		from service_env_vars
		join services on services.id = service_env_vars.service_id
		where services.name = $1
		order by service_env_vars.name asc
	`, name)
	if err != nil {
		return AppSpec{}, fmt.Errorf("load env for %s: %w", name, err)
	}
	defer envRows.Close()
	for envRows.Next() {
		var envName string
		var encrypted string
		if err := envRows.Scan(&envName, &encrypted); err != nil {
			return AppSpec{}, fmt.Errorf("scan env row for %s: %w", name, err)
		}
		value, err := r.cipher.Decrypt(encrypted)
		if err != nil {
			return AppSpec{}, fmt.Errorf("decrypt env %s: %w", envName, err)
		}
		spec.Env[envName] = value
	}
	if err := envRows.Err(); err != nil {
		return AppSpec{}, fmt.Errorf("iterate env rows for %s: %w", name, err)
	}

	return spec, nil
}
