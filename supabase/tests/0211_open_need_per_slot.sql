-- Kiểm tay 0207/0208/0211 (nhãn Cần host / Cần trợ live theo từng ca). Dán nguyên file vào SQL Editor và chạy.
-- Cả khối là MỘT câu lệnh và kết thúc bằng RAISE EXCEPTION ⇒ DB tự rollback, không để lại dữ liệu. Kết quả nằm trong thông báo lỗi
-- ("KẾT QUẢ ... đúng 6/6"): đó là kết quả bình thường, không phải lỗi thật.
do $$
declare
  v_slot uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_got text;
  v_out text := '';
  v_pass int := 0;
  v_total int := 0;
begin
  select id into v_slot from shift_slots
   where status = 'open' and session_id is null and date >= date '2026-12-10'
     and not exists (select 1 from roster_drafts d where d.slot_id = shift_slots.id)
   order by date limit 1;
  select id into v_t1 from talents order by id limit 1;
  select id into v_t2 from talents order by id offset 1 limit 1;
  if v_slot is null or v_t1 is null or v_t2 is null then
    raise exception 'Thiếu dữ liệu để thử (cần 1 ca mở T12 chưa nháp + 2 talent)';
  end if;

  select coalesce(open_need, 'null') into v_got from shift_slots where id = v_slot;
  v_total := v_total + 1; if v_got = 'null' then v_pass := v_pass + 1; end if;
  v_out := v_out || E'\n1 ca T12 chưa nháp (mong null): ' || v_got;

  insert into roster_drafts (slot_id, host_id) values (v_slot, v_t1);
  select coalesce(open_need, 'null') into v_got from shift_slots where id = v_slot;
  v_total := v_total + 1; if v_got = 'co_host' then v_pass := v_pass + 1; end if;
  v_out := v_out || E'\n2 nháp host-only (mong co_host): ' || v_got;

  update roster_drafts set no_assistant = true where slot_id = v_slot;
  select coalesce(open_need, 'null') into v_got from shift_slots where id = v_slot;
  v_total := v_total + 1; if v_got = 'null' then v_pass := v_pass + 1; end if;
  v_out := v_out || E'\n3 host + No Asst (mong null): ' || v_got;

  update roster_drafts set no_assistant = false, co_host_id = v_t2 where slot_id = v_slot;
  select coalesce(open_need, 'null') into v_got from shift_slots where id = v_slot;
  v_total := v_total + 1; if v_got = 'null' then v_pass := v_pass + 1; end if;
  v_out := v_out || E'\n4 host + trợ (mong null): ' || v_got;

  update roster_drafts set host_id = null where slot_id = v_slot;
  select coalesce(open_need, 'null') into v_got from shift_slots where id = v_slot;
  v_total := v_total + 1; if v_got = 'host' then v_pass := v_pass + 1; end if;
  v_out := v_out || E'\n5 chỉ trợ (mong host): ' || v_got;

  delete from roster_drafts where slot_id = v_slot;
  select coalesce(open_need, 'null') into v_got from shift_slots where id = v_slot;
  v_total := v_total + 1; if v_got = 'null' then v_pass := v_pass + 1; end if;
  v_out := v_out || E'\n6 xoá nháp (mong null): ' || v_got;

  raise exception 'KẾT QUẢ (đã rollback, bình thường): đúng % / % %', v_pass, v_total, v_out;
end $$;
