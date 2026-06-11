package envfile

import "testing"

func TestParse(t *testing.T) {
	vars, err := Parse(`
# comment
NODE_ENV=production
export API_KEY="secret-value"
DATABASE_URL='postgres://example'
ESCAPED="line\nnext"
NODE_ENV=staging
`)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if len(vars) != 4 {
		t.Fatalf("len(vars) = %d, want 4", len(vars))
	}
	if vars[0].Name != "NODE_ENV" || vars[0].Value != "staging" {
		t.Fatalf("vars[0] = %#v, want duplicate to overwrite NODE_ENV", vars[0])
	}
	if vars[1].Name != "API_KEY" || vars[1].Value != "secret-value" {
		t.Fatalf("vars[1] = %#v", vars[1])
	}
	if vars[2].Name != "DATABASE_URL" || vars[2].Value != "postgres://example" {
		t.Fatalf("vars[2] = %#v", vars[2])
	}
	if vars[3].Name != "ESCAPED" || vars[3].Value != "line\nnext" {
		t.Fatalf("vars[3] = %#v", vars[3])
	}
}

func TestParseRejectsInvalidName(t *testing.T) {
	if _, err := Parse("1BAD=value"); err == nil {
		t.Fatal("Parse() error = nil, want invalid name error")
	}
}
