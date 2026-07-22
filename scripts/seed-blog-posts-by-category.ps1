# Cria 12 posts (1 por categoria) via POST /api/blog/posts e publica no Supabase.
# Requer: .env.vercel.tmp com BLOG_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Capas precisam estar públicas em /images/

$ErrorActionPreference = 'Stop'
$base = 'https://papele-educa.vercel.app'

function Get-DotEnv([string]$path) {
  $map = @{}
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $n, $v = $_.Split('=', 2)
    $map[$n.Trim()] = $v.Trim().Trim('"')
  }
  return $map
}

$envMap = @{}
$envFile = Join-Path $PSScriptRoot '..\.env.vercel.tmp'
if (Test-Path $envFile) { $envMap = Get-DotEnv $envFile }
$apiKey = $env:BLOG_API_KEY
if (-not $apiKey -or $apiKey -eq '[SENSITIVE]') { $apiKey = $envMap['BLOG_API_KEY'] }
if (-not $apiKey -or $apiKey -eq '[SENSITIVE]') { $apiKey = 'qwertyuiop' }

# Publish happens via API status=published (no service-role patch required)
if (-not $apiKey) {
  throw 'Defina BLOG_API_KEY no ambiente.'
}

$posts = @(
  @{
    category = 'Educação Infantil'
    title = 'Observar para planejar: documentação pedagógica na primeira infância'
    slug = 'observar-planejar-documentacao-pedagogica'
    cover = 'blog-observacao-doc.png'
    tags = @('documentação', 'observação', 'planejamento')
    excerpt = 'A observação atenta e o registro cuidadoso ajudam a professor a conhecer cada criança e a planejar experiências mais significativas — alinhadas às DCNEI e à BNCC.'
    content = @'
<p>Na Educação Infantil, ensinar começa por <strong>olhar</strong>. As Diretrizes Curriculares Nacionais para a Educação Infantil (DCNEI) e a Base Nacional Comum Curricular (BNCC) destacam que as práticas devem partir das experiências concretas das crianças, com interações e brincadeiras como eixos.</p>
<h2>Por que documentar</h2>
<p>Documentar não é apenas “preencher ficha”. É reunir evidências do modo como a criança explora, se relaciona e formula hipóteses. Esse material sustenta o planejamento e a conversa com as famílias.</p>
<ul>
<li>Escolha um foco por semana (por exemplo, como a criança resolve conflitos no faz de conta).</li>
<li>Registre com fotos, falas literais e anotações curtas no mesmo dia.</li>
<li>Relacione o registro a direitos de aprendizagem e campos de experiência da BNCC.</li>
</ul>
<h2>Do registro ao próximo passo</h2>
<p>Ao final da semana, releia os registros e pergunte: o que essa criança já demonstra? O que ainda precisa ser ofertado? O próximo planejamento nasce dessa leitura — e não de uma lista genérica de atividades.</p>
<blockquote><p>Fontes de referência: BNCC (MEC) e DCNEI — documentos oficiais que orientam a Educação Infantil no Brasil.</p></blockquote>
'@
  },
  @{
    category = 'BNCC na prática'
    title = 'Do campo de experiência ao plano da semana: um roteiro simples'
    slug = 'campo-experiencia-plano-semana-bncc'
    cover = 'blog-bncc-planejamento.png'
    tags = @('BNCC', 'campos de experiência', 'planejamento')
    excerpt = 'Os cinco campos de experiência da BNCC ganham vida quando viram intenções claras no plano semanal — sem transformar a Base em checklist rígido.'
    content = @'
<p>A BNCC organiza a Educação Infantil em cinco <strong>campos de experiência</strong>: O eu, o outro e o nós; Corpo, gestos e movimentos; Traços, sons, cores e formas; Escuta, fala, pensamento e imaginação; Espaços, tempos, quantidades, relações e transformações.</p>
<h2>Um roteiro em quatro passos</h2>
<ol>
<li><strong>Observe</strong> o que o grupo tem vivido e o que as crianças perguntam.</li>
<li><strong>Escolha 1–2 campos</strong> como ênfase da semana (os demais continuam presentes na rotina).</li>
<li><strong>Defina intenções</strong> em linguagem simples (“ampliar vocabulário sobre emoções”, “explorar medidas com água”).</li>
<li><strong>Desenhe experiências</strong> abertas — não “tarefinhas” fechadas — e prevê materiais e espaços.</li>
</ol>
<h2>O que evitar</h2>
<p>Tratar cada objetivo da BNCC como item a “cumprir” em sequência. A Base não é currículo pronto: ela orienta aprendizagens essenciais; o currículo local e o planejamento da professora dão forma ao cotidiano.</p>
<blockquote><p>Referência: Base Nacional Comum Curricular — Educação Infantil (MEC).</p></blockquote>
'@
  },
  @{
    category = 'Brincar e interações'
    title = 'Faz de conta que ensina: linguagem, vínculo e imaginação'
    slug = 'faz-de-conta-linguagem-vinculo'
    cover = 'blog-faz-de-conta.png'
    tags = @('faz de conta', 'brincadeira', 'linguagem')
    excerpt = 'O brincar de faz de conta é território rico para oralidade, empatia e criação de narrativas — e merece tempo, espaço e materiais generosos.'
    content = @'
<p>Quando a criança “vira” médico, chef ou astronauta, ela ensaiia papéis sociais, pratica a fala e negocia regras com o grupo. A BNCC reconhece o brincar como direito e como eixo estruturante da Educação Infantil.</p>
<h2>Como enriquecer o faz de conta</h2>
<ul>
<li>Ofereça cenários simples (cozinha, mercado, clínica) com objetos abertos e seguros.</li>
<li>Entre na brincadeira só quando convidada — perguntando, não dirigindo o roteiro.</li>
<li>Depois, retome com o grupo: “O que vocês inventaram hoje?”</li>
</ul>
<h2>Sinais de qualidade</h2>
<p>Há turnos de fala, crianças menores são incluídas, conflitos são mediados e o tema se aprofunda ao longo dos dias. Se o canto fica vazio, revise disposição, tempo na rotina e atratividade dos materiais.</p>
<blockquote><p>Referências: BNCC (eixos interações e brincadeiras) e orientações das DCNEI sobre experiências cotidianas.</p></blockquote>
'@
  },
  @{
    category = 'Alfabetização e letramento'
    title = 'Cantinho de leitura viva: conversar sobre livros antes de “soletrar”'
    slug = 'cantinho-leitura-viva-conversa-literaria'
    cover = 'blog-letramento.png'
    tags = @('leitura', 'letramento', 'oralidade')
    excerpt = 'Na infância, o letramento começa na escuta, no prazer de ouvir histórias e na conversa sobre imagens — bases sólidas para a alfabetização posterior.'
    content = @'
<p>Letramento não se resume a decodificar letras. Na Educação Infantil, ele se constrói quando a criança participa de práticas sociais de leitura e escrita: ouvir histórias, folhear livros, ditarem ideias para um adulto registrar.</p>
<h2>Práticas que funcionam</h2>
<ul>
<li>Leitura diária em voz alta, com pausas para a criança comentar as imagens.</li>
<li>Acervo acessível, ao alcance das mãos, com livros de qualidade e diversidade cultural.</li>
<li>Registrar coletivamente uma receita, um combinado ou um recado para a família.</li>
</ul>
<h2>Cuidado com a pressa</h2>
<p>Forçar treinos mecânicos de sílabas cedo demais pode afastar a criança do prazer de ler. Priorize sentido, vínculo e repertório — alinhado aos campos Escuta, fala, pensamento e imaginação e Traços, sons, cores e formas da BNCC.</p>
<blockquote><p>Referências: BNCC — Educação Infantil; práticas de leitura literária recomendadas por redes e publicações pedagógicas de qualidade.</p></blockquote>
'@
  },
  @{
    category = 'Matemática lúdica'
    title = 'Contar, classificar e comparar: matemática com as mãos'
    slug = 'contar-classificar-comparar-matematica-concreta'
    cover = 'blog-matematica-concreta.png'
    tags = @('matemática', 'quantidades', 'materiais concretos')
    excerpt = 'Antes dos números no papel, a criança precisa viver quantidades, relações e transformações — exatamente o campo de experiência previsto na BNCC.'
    content = @'
<p>O campo <strong>Espaços, tempos, quantidades, relações e transformações</strong> convida a explorar matemática de modo sensível e concreto: empilhar, separar por cor, comparar “mais/menos”, medir com o corpo.</p>
<h2>Propostas simples e potentes</h2>
<ul>
<li>Classificar tampinhas por cor e tamanho, depois contar cada grupo.</li>
<li>Montar trilhas no chão e pedir “três passos à frente”.</li>
<li>Cozinhar de mentira: “quantas xícaras cabem na jarra?”</li>
</ul>
<h2>O papel da professora</h2>
<p>Faça perguntas que provoquem comparação e previsão. Evite fichas repetitivas desconectadas da experiência. O registro pode ser foto + legenda dita pela criança.</p>
<blockquote><p>Referência: BNCC — campo Espaços, tempos, quantidades, relações e transformações (MEC).</p></blockquote>
'@
  },
  @{
    category = 'Arte e expressão'
    title = 'Ateliê sem modelo pronto: processos criativos na infância'
    slug = 'atelier-processos-criativos-infancia'
    cover = 'blog-arte-atelier.png'
    tags = @('arte', 'expressão', 'criatividade')
    excerpt = 'Arte na Educação Infantil valoriza o processo, a experimentação de materiais e a autoria da criança — não a cópia de um desenho “certo”.'
    content = @'
<p>O campo <strong>Traços, sons, cores e formas</strong> da BNCC reconhece a arte como linguagem. Quando oferecemos apenas “modelos para colorir”, reduzimos a chance de a criança inventar marcas próprias.</p>
<h2>Como organizar um ateliê vivo</h2>
<ul>
<li>Materiais acessíveis e renovados (tintas, carvão, argila, papéis variados).</li>
<li>Tempo longo o bastante para começar, errar e recomeçar.</li>
<li>Conversas estéticas: “o que você quis mostrar?” em vez de “ficou bonito”.</li>
</ul>
<h2>Música e movimento</h2>
<p>Inclua exploração sonora e dança livre. Corpo, gestos e movimentos se cruzam com a arte e ampliam a expressão.</p>
<blockquote><p>Referência: BNCC — Traços, sons, cores e formas; Corpo, gestos e movimentos.</p></blockquote>
'@
  },
  @{
    category = 'Socioemocional'
    title = 'Nomear sentimentos: um vocabulário emocional para a sala'
    slug = 'nomear-sentimentos-vocabulario-emocional'
    cover = 'blog-socioemocional.png'
    tags = @('emoções', 'convivência', 'escuta')
    excerpt = 'Ajudar a criança a nomear o que sente fortalece autorregulação, empatia e convivência — competências do campo O eu, o outro e o nós.'
    content = @'
<p>Chorar, gritar ou se isolar são formas de comunicação. O adulto mediador traduz: “Parece que você ficou frustrado porque a torre caiu.” Nomear não resolve sozinho, mas abre caminho para estratégias.</p>
<h2>Rotinas que ajudam</h2>
<ul>
<li>Roda de conversa com cartões de emoções (sem forçar exposição).</li>
<li>Espaço calmo com objetos sensoriais para pausar.</li>
<li>Scripts de mediação: “Você quer o brinquedo. Ele ainda está usando. Vamos combinar um tempo?”</li>
</ul>
<h2>Parceria com a família</h2>
<p>Compartilhe a mesma linguagem em bilhetes ou reuniões. Coerência entre casa e escola amplia a segurança emocional da criança.</p>
<blockquote><p>Referências: BNCC — O eu, o outro e o nós; evidências gerais de programas de aprendizagem socioemocional em idade precoce (literatura educacional).</p></blockquote>
'@
  },
  @{
    category = 'Família e escola'
    title = 'Chegada e despedida: rituais que fortalecem o vínculo família–escola'
    slug = 'chegada-despedida-vinculo-familia-escola'
    cover = 'blog-familia-escola.png'
    tags = @('família', 'acolhida', 'comunicação')
    excerpt = 'Os minutos da entrada e da saída são oportunidades pedagógicas: acolher, informar e construir confiança mútua entre famílias e equipe.'
    content = @'
<p>As DCNEI afirmam a indissociabilidade entre educar e cuidar e valorizam a participação das famílias. Uma acolhida apressada ou uma saída confusa enfraquece esse elo.</p>
<h2>Pequenos rituais de grande efeito</h2>
<ul>
<li>Cumprimento pelo nome da criança e do responsável.</li>
<li>Quadro visual do dia (foto das experiências previstas).</li>
<li>Combinar um canal claro para avisos (e evitar sobrecarga de mensagens).</li>
</ul>
<h2>Quando há tensão</h2>
<p>Escute primeiro. Traga fatos observados, não juízos. Convide a família a contar o que funciona em casa. A parceria se constrói na escuta recíproca.</p>
<blockquote><p>Referências: DCNEI; BNCC (participação das famílias como princípio da Educação Infantil).</p></blockquote>
'@
  },
  @{
    category = 'Inclusão e diversidade'
    title = 'Participar de verdade: acessibilidade no brincar e na rotina'
    slug = 'participar-acessibilidade-brincar-rotina'
    cover = 'blog-inclusao.png'
    tags = @('inclusão', 'acessibilidade', 'diversidade')
    excerpt = 'Incluir não é só matricular: é garantir que cada criança participe das brincadeiras, das rodas e das decisões do cotidiano, com apoios justos.'
    content = @'
<p>A legislação brasileira e as diretrizes da Educação Infantil defendem o direito de todas as crianças à educação de qualidade. Na prática, isso exige olhar para barreiras físicas, comunicacionais e atitudinais.</p>
<h2>Perguntas que guiam o planejamento</h2>
<ul>
<li>Todos conseguem acessar os materiais do canto?</li>
<li>Há múltiplas formas de se expressar (gesto, imagem, fala, tecnologia assistiva)?</li>
<li>As brincadeiras têm papéis variados, não só “os mais ágeis vencem”?</li>
</ul>
<h2>Diversidade como conteúdo</h2>
<p>Livros, bonecos e músicas devem refletir diferentes corpos, culturas e famílias. Representação importa para pertencimento.</p>
<blockquote><p>Referências: LDB e políticas de educação inclusiva; princípios das DCNEI e da BNCC sobre equidade e participação.</p></blockquote>
'@
  },
  @{
    category = 'Rotina e organização'
    title = 'Rotina visual e acolhida: previsibilidade sem engessar o dia'
    slug = 'rotina-visual-acolhida-previsibilidade'
    cover = 'blog-rotina-acolhida.png'
    tags = @('rotina', 'organização', 'acolhida')
    excerpt = 'Uma rotina clara reduz ansiedade e libera energia para explorar. O segredo é combinar previsibilidade com flexibilidade para os interesses das crianças.'
    content = @'
<p>Crianças pequenas se orientam melhor quando sabem o que vem depois. Cartões com fotos da sequência do dia (acolhida, parque, lanche, história) são apoios concretos de organização espacial e temporal.</p>
<h2>Como montar sem engessar</h2>
<ul>
<li>Mantenha âncoras fixas (lanche, higiene, descanso).</li>
<li>Deixe blocos flexíveis para projetos e interesses emergentes.</li>
<li>Revise a rotina com o grupo: “o que podemos mudar nesta semana?”</li>
</ul>
<h2>Ambientes que ajudam</h2>
<p>Cantos definidos, circulação segura e materiais à altura da criança diminuem conflitos e aumentam autonomia — princípios alinhados às DCNEI.</p>
<blockquote><p>Referências: DCNEI (organização do tempo e do espaço); BNCC (participar e explorar).</p></blockquote>
'@
  },
  @{
    category = 'Materiais pedagógicos'
    title = 'Escolher material com intenção: menos estoque, mais sentido'
    slug = 'escolher-material-intencao-pedagogica'
    cover = 'blog-materiais.png'
    tags = @('materiais', 'recursos', 'intencionalidade')
    excerpt = 'Bom material pedagógico não é o mais colorido da prateleira: é o que amplia exploração, linguagem e convivência com segurança e propósito.'
    content = @'
<p>Antes de comprar ou imprimir, pergunte: qual experiência este recurso favorece? Quais direitos ou campos da BNCC ele mobiliza? Sem intenção, o material vira enfeite.</p>
<h2>Critérios práticos</h2>
<ul>
<li><strong>Abertura:</strong> permite vários usos (blocos &gt; planilha fechada).</li>
<li><strong>Segurança e durabilidade</strong> para a faixa etária.</li>
<li><strong>Acessibilidade:</strong> tamanho, contraste, alternativas sensoriais.</li>
<li><strong>Diversidade:</strong> representa diferentes culturas e corpos.</li>
</ul>
<h2>Impressos com propósito</h2>
<p>Fichas e cartazes ajudam quando apoiam jogos, cantigas ou registros coletivos — não quando viram “trabalhinho” mecânico desconectado da brincadeira.</p>
<blockquote><p>Referência: alinhamento de recursos às intenções da BNCC e às DCNEI sobre organização de materiais e espaços.</p></blockquote>
'@
  },
  @{
    category = 'Ideias prontas'
    title = 'Bandeja da natureza: exploração sensorial em 20 minutos'
    slug = 'bandeja-natureza-exploracao-sensorial'
    cover = 'blog-ideias-natureza.png'
    tags = @('natureza', 'sensorial', 'ideia pronta')
    excerpt = 'Uma proposta rápida, de baixo custo, para investigar texturas, cheiros e formas — conectada ao campo Espaços, tempos, quantidades, relações e transformações.'
    content = @'
<p>Reúna folhas, sementes, pedrinhas limpas, cascas e um compartimento com lupa. Disponha em bandejas e convide: “O que vocês notam?”</p>
<h2>Passo a passo</h2>
<ol>
<li>Prepare 4–5 bandejas iguais para pequenos grupos.</li>
<li>Combine regras de cuidado com seres vivos (se houver insetos, observar sem machucar).</li>
<li>Ofereça papel e giz para registrar achados com desenhos.</li>
<li>Feche com uma roda: cada grupo mostra um “tesouro” e explica por quê.</li>
</ol>
<h2>Variações</h2>
<p>Tema chuva (recipientes para medir), tema cheiros (ervas), tema sons (sacolas com materiais para chacoalhar). Sempre com intenção clara e tempo para conversar.</p>
<blockquote><p>Referência: BNCC — exploração do entorno natural e cultural; práticas de educação ao ar livre reconhecidas em orientações pedagógicas contemporâneas.</p></blockquote>
'@
  }
)

function Wait-Cover([string]$url) {
  for ($i = 1; $i -le 15; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 20
      if ($r.StatusCode -eq 200) { return $true }
    } catch {
      Start-Sleep -Seconds 5
    }
  }
  return $false
}

$created = @()
foreach ($p in $posts) {
  $coverUrl = "$base/images/$($p.cover)"
  Write-Host "`n==> $($p.category): $($p.title)"
  if (-not (Wait-Cover $coverUrl)) {
    Write-Warning "Capa ainda não pública: $coverUrl (seguindo mesmo assim)"
  }

  $bodyObj = @{
    title = $p.title
    slug = $p.slug
    excerpt = $p.excerpt
    content_html = $p.content
    category = $p.category
    tags = $p.tags
    cover_url = $coverUrl
    og_image_url = $coverUrl
    seo_title = $p.title
    seo_description = $p.excerpt
    author_name = 'Papelê Educa'
    status = 'published'
  }
  $body = $bodyObj | ConvertTo-Json -Depth 5

  $resp = Invoke-RestMethod -Uri "$base/api/blog/posts" -Method POST -Headers @{
    'Content-Type' = 'application/json; charset=utf-8'
    'X-API-Key' = $apiKey
  } -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

  Write-Host "Criado status=$($resp.status) id=$($resp.id) slug=$($resp.slug)"
  Write-Host "URL: $base/blog/$($resp.slug)"
  $created += [pscustomobject]@{ category = $p.category; slug = $resp.slug; id = $resp.id; status = $resp.status }
}

Write-Host "`nConcluído: $($created.Count) posts"
$created | Format-Table -AutoSize
