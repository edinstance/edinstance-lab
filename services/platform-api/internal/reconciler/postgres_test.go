package reconciler

import "testing"

func TestPostgresPublicServiceTargetsPooler(t *testing.T) {
	r := &Reconciler{}
	service := r.postgresPublicService(PostgresSpec{
		Name: "customer-db", Namespace: "apps", PoolerEnabled: true,
		PublicHostname: "db.edinstance.uk", PublicSourceCIDRs: []string{"203.0.113.10/32"},
	})

	selector, found, err := unstructuredNestedStringMap(service.Object, "spec", "selector")
	if err != nil || !found {
		t.Fatalf("selector missing: found=%v err=%v", found, err)
	}
	if selector["cnpg.io/poolerName"] != "customer-db-pooler-rw" {
		t.Fatalf("public service has unexpected selector: %#v", selector)
	}
}

func unstructuredNestedStringMap(object map[string]any, fields ...string) (map[string]string, bool, error) {
	current := any(object)
	for _, field := range fields {
		values, ok := current.(map[string]any)
		if !ok {
			return nil, false, nil
		}
		current, ok = values[field]
		if !ok {
			return nil, false, nil
		}
	}
	values, ok := current.(map[string]any)
	if !ok {
		return nil, false, nil
	}
	result := make(map[string]string, len(values))
	for key, value := range values {
		text, ok := value.(string)
		if !ok {
			return nil, false, nil
		}
		result[key] = text
	}
	return result, true, nil
}
