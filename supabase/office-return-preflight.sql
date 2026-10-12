-- READ ONLY: existing location IDs/names and return implementation metadata.
-- No accounts, equipment, custody, movements, emails, tokens or records changed.
select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'location',s.location,
    'is_active',to_jsonb(s)->'is_active') order by s.name,s.id)
    from public.sites s),'[]'::jsonb),
  'identity_installed',to_regprocedure('mcpa_auth_private.identity()') is not null,
  'portal_gateway_installed',to_regprocedure('mcpa_auth_private.movement_authorized(text,jsonb,uuid)') is not null,
  'cancellation_gateway_installed',to_regprocedure('mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid)') is not null,
  'office_return_installed',to_regprocedure('public.mcpa_return_destination()') is not null,
  'movement_gateway_source_md5',(select md5(replace(prosrc,E'\r','')) from pg_proc
    where oid=to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')),
  'return_implementation_source_md5',(select md5(replace(prosrc,E'\r','')) from pg_proc
    where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'reviewed_lifecycle_compatible',(select md5(replace(replace(prosrc,E'\r',''),
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$required$))='5b94b3b5642f26981a80382a2b1b6be7'
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'optional_purpose_installed',(select strpos(prosrc,$optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$)>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'stable_recipient_preserved',(select strpos(prosrc,$identity$v_receiver_id := nullif(p_payload->>'receiverId','')::uuid;$identity$)>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'anonymous_movement_execute',coalesce(has_function_privilege('anon',
    to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')::oid,'EXECUTE'),false)
) as office_return_preflight;
