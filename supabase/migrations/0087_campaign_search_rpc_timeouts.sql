alter function public.campaign_search_segment_candidates(jsonb)
  set statement_timeout = '60s';

alter function public.campaign_search_semantic_candidates(jsonb)
  set statement_timeout = '60s';
