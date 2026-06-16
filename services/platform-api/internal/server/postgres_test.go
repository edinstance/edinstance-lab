package server

import "testing"

func TestValidatePostgresRequestPublicAccess(t *testing.T) {
	base := CreatePostgresRequest{
		Name: "customer-db", Database: "app", Owner: "app", Password: "long-password",
		Version: "17", Instances: 3, StorageSize: "20Gi", PoolerInstances: 2,
		PoolMode: "session", PoolerEnabled: true, Public: true, PublicHostname: "db.local.edinstance.uk",
		PublicSourceCIDRs: []string{"203.0.113.10/32"},
	}
	if err := validatePostgresRequest(base); err != nil {
		t.Fatalf("valid public database rejected: %v", err)
	}

	withoutCIDR := base
	withoutCIDR.PublicSourceCIDRs = nil
	if err := validatePostgresRequest(withoutCIDR); err != nil {
		t.Fatalf("public database without source restrictions rejected: %v", err)
	}

	withoutPooler := base
	withoutPooler.PoolerEnabled = false
	if err := validatePostgresRequest(withoutPooler); err == nil {
		t.Fatal("expected public database without PgBouncer to be rejected")
	}

	invalidHostname := base
	invalidHostname.PublicHostname = "https://db.edinstance.uk"
	if err := validatePostgresRequest(invalidHostname); err == nil {
		t.Fatal("expected invalid public hostname to be rejected")
	}

	nonLocalHostname := base
	nonLocalHostname.PublicHostname = "db.edinstance.uk"
	if err := validatePostgresRequest(nonLocalHostname); err == nil {
		t.Fatal("expected non-local hostname to be rejected")
	}
}

func TestValidatePostgresRequestRejectsReservedOwners(t *testing.T) {
	base := CreatePostgresRequest{
		Name: "customer-db", Database: "app", Owner: "app", Password: "long-password",
		Version: "17", Instances: 3, StorageSize: "20Gi", PoolerInstances: 2,
		PoolMode: "session", PoolerEnabled: true,
	}

	for _, owner := range []string{"postgres", "streaming_replica", "cnpg_pooler_pgbouncer"} {
		request := base
		request.Owner = owner
		if err := validatePostgresRequest(request); err == nil {
			t.Fatalf("expected reserved owner %q to be rejected", owner)
		}
	}
}
