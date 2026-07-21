-- Seed: 12 categorias do blog Papelê Educa
-- Rode no SQL Editor do Supabase. Seguro reexecutar (idempotente por slug).

insert into public.blog_categories (name, slug, description, sort_order)
values
  (
    'Educação Infantil',
    'educacao-infantil',
    'Práticas, rotinas e reflexões sobre a primeira infância e o trabalho com bebês e crianças pequenas.',
    1
  ),
  (
    'BNCC na prática',
    'bncc-na-pratica',
    'Como traduzir direitos de aprendizagem, campos de experiência e competências em propostas concretas.',
    2
  ),
  (
    'Brincar e interações',
    'brincar-e-interacoes',
    'O brincar como eixo pedagógico: faz de conta, jogos, exploração e convivência.',
    3
  ),
  (
    'Alfabetização e letramento',
    'alfabetizacao-e-letramento',
    'Leitura, escrita e oralidade com propostas lúdicas e significativas para a infância.',
    4
  ),
  (
    'Matemática lúdica',
    'matematica-ludica',
    'Números, quantidades, espaço e relações por meio de jogos, materiais concretos e brincadeiras.',
    5
  ),
  (
    'Arte e expressão',
    'arte-e-expressao',
    'Desenho, cores, música, movimento e outras linguagens para a criança se expressar e criar.',
    6
  ),
  (
    'Socioemocional',
    'socioemocional',
    'Autoconhecimento, empatia, vínculos e regulação emocional no cotidiano escolar e familiar.',
    7
  ),
  (
    'Família e escola',
    'familia-e-escola',
    'Parceria com responsáveis, comunicação e continuidade do aprendizado entre casa e escola.',
    8
  ),
  (
    'Inclusão e diversidade',
    'inclusao-e-diversidade',
    'Práticas acolhedoras, acessibilidade e respeito às diferentes formas de aprender e ser.',
    9
  ),
  (
    'Rotina e organização',
    'rotina-e-organizacao',
    'Planejamento, tempos, espaços, documentação pedagógica e organização da sala.',
    10
  ),
  (
    'Materiais pedagógicos',
    'materiais-pedagogicos',
    'Como escolher, adaptar e usar recursos impressos, manipuláveis e digitais com intencionalidade.',
    11
  ),
  (
    'Ideias prontas',
    'ideias-prontas',
    'Atividades, projetos e sequências práticas para aplicar com pouco preparo e muito propósito.',
    12
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();
