package server

type App struct {
	Name      string   `json:"name"`
	Image     string   `json:"image"`
	Status    string   `json:"status"`
	Ready     bool     `json:"ready"`
	Replicas  int      `json:"replicas"`
	Port      int      `json:"port"`
	Domains   []Domain `json:"domains"`
	LastBuild string   `json:"lastBuild"`
	Source    string   `json:"source"`
	UpdatedAt string   `json:"updatedAt"`
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
	Name     string   `json:"name"`
	Image    string   `json:"image"`
	Port     int      `json:"port"`
	Replicas int      `json:"replicas,omitempty"`
	Domains  []string `json:"domains,omitempty"`
}
