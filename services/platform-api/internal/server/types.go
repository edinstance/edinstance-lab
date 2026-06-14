package server

type App struct {
	Name          string   `json:"name"`
	Image         string   `json:"image"`
	Status        string   `json:"status"`
	Ready         bool     `json:"ready"`
	Replicas      int      `json:"replicas"`
	Port          int      `json:"port"`
	HealthPath    string   `json:"healthPath"`
	Domains       []Domain `json:"domains"`
	LastBuild     string   `json:"lastBuild"`
	Source        string   `json:"source"`
	UpdatedAt     string   `json:"updatedAt"`
	FailureReason string   `json:"failureReason,omitempty"`
}

type Domain struct {
	Host   string `json:"host"`
	Scope  string `json:"scope"`
	Status string `json:"status"`
}

type EnvVarMetadata struct {
	Name   string `json:"name"`
	Secret bool   `json:"secret"`
}

type CreateAppRequest struct {
	Name       string   `json:"name"`
	Image      string   `json:"image"`
	Port       int      `json:"port"`
	Replicas   int      `json:"replicas,omitempty"`
	Domains    []string `json:"domains,omitempty"`
	HealthPath string   `json:"healthPath,omitempty"`
}

type UpdateAppRequest struct {
	HealthPath string `json:"healthPath"`
}

type PostgresDatabase struct {
	Name              string   `json:"name"`
	Namespace         string   `json:"namespace"`
	Database          string   `json:"database"`
	Owner             string   `json:"owner"`
	Version           string   `json:"version"`
	Instances         int      `json:"instances"`
	StorageSize       string   `json:"storageSize"`
	PoolerEnabled     bool     `json:"poolerEnabled"`
	PoolerInstances   int      `json:"poolerInstances"`
	PoolMode          string   `json:"poolMode"`
	Public            bool     `json:"public"`
	PublicHostname    string   `json:"publicHostname,omitempty"`
	PublicSourceCIDRs []string `json:"publicSourceCidrs,omitempty"`
	Host              string   `json:"host"`
	CredentialsSecret string   `json:"credentialsSecret"`
	Status            string   `json:"status"`
}

type CreatePostgresRequest struct {
	Name              string   `json:"name"`
	Database          string   `json:"database"`
	Owner             string   `json:"owner"`
	Password          string   `json:"password"`
	Version           string   `json:"version"`
	Instances         int      `json:"instances"`
	StorageSize       string   `json:"storageSize"`
	PoolerEnabled     bool     `json:"poolerEnabled"`
	PoolerInstances   int      `json:"poolerInstances"`
	PoolMode          string   `json:"poolMode"`
	Public            bool     `json:"public"`
	PublicHostname    string   `json:"publicHostname,omitempty"`
	PublicSourceCIDRs []string `json:"publicSourceCidrs,omitempty"`
}

type PostgresCredentials struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
	Password string `json:"password"`
	URL      string `json:"url"`
}
