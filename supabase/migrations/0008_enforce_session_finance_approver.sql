-- Fixes a data-integrity gap: setSessionFinanceApproval() took `approvedByUserId` as a plain
-- client-supplied parameter and wrote it straight to `approved_by` with no check that it matches
-- the actual caller. Since the write path is a JS client using the anon key, any check done in
-- JS can be bypassed by calling Supabase directly — the only reliable place to guarantee
-- "approved_by is really who approved it" is the database.
--
-- This trigger ignores whatever the client sends for approved_by/approved_at and derives them
-- from the session's own JWT (auth.uid()) instead, whenever approval_status is actually being
-- set (insert, or an update that changes it). Plain cost-field edits via upsertSessionFinance()
-- never touch approval_status, so an already-approved row's approved_by/approved_at are left
-- alone on those updates — only a genuine approve/reject call reassigns them.
create or replace function enforce_session_finance_approver() returns trigger as $$
declare
  status_changed boolean;
begin
  -- OLD is unassigned for INSERT-context trigger calls — referencing it directly would error,
  -- so branch on TG_OP instead of relying on short-circuit evaluation.
  if TG_OP = 'INSERT' then
    status_changed := true;
  else
    status_changed := (new.approval_status is distinct from old.approval_status);
  end if;

  if status_changed then
    if new.approval_status = 'pending' then
      new.approved_by := null;
      new.approved_at := null;
    else
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_session_finance_approver
  before insert or update on session_finance
  for each row execute function enforce_session_finance_approver();
