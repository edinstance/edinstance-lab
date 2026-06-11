package server

import "context"

func (s *Server) reconcileAppIfEnabled(ctx context.Context, name string) error {
	if s.reconciler == nil {
		return nil
	}
	return s.reconciler.ReconcileApp(ctx, name)
}

func (s *Server) refreshAllStatusesIfEnabled(ctx context.Context) error {
	if s.reconciler == nil {
		return nil
	}
	return s.reconciler.RefreshAllStatuses(ctx)
}

func (s *Server) refreshAppStatusIfEnabled(ctx context.Context, name string) error {
	if s.reconciler == nil {
		return nil
	}
	return s.reconciler.RefreshAppStatus(ctx, name)
}

func (s *Server) deleteRuntimeAppIfEnabled(ctx context.Context, name string) error {
	if s.reconciler == nil {
		return nil
	}
	return s.reconciler.DeleteApp(ctx, name)
}
