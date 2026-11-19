drop trigger if exists trg_notify_empresa_alta on public.empresas;
create trigger trg_notify_empresa_alta
after insert on public.empresas
for each row execute function public.fn_notify_empresa_alta();