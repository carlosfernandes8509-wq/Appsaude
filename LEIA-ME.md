# Meu App de Saúde

App pessoal para iPhone (PWA): metas de calorias e macros com base científica, diário alimentar (busca na Tabela TACO, produtos industrializados, foto e descrição com IA), plano de treino com registro de cargas, acompanhamento de peso com ajuste automático da meta e busca de artigos no PubMed com resumo em português.

**Custo: R$ 0.** Não precisa de Mac nem de conta de desenvolvedor Apple.

---

## 1. Publicar no GitHub Pages (uma vez só, ~10 min)

1. Entre em **github.com** e clique em **New** (novo repositório).
2. Nome: `meu-app-saude`. Deixe como **Public** (o GitHub Pages grátis exige repositório público; seus dados NÃO ficam no repositório, só o código). Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Extraia o `.zip` no computador e **arraste todos os arquivos e a pasta `icons`** para a página. Clique em **Commit changes**.
   - Os arquivos `index.html`, `app.js` etc. precisam ficar na **raiz** do repositório, não dentro de uma subpasta.
5. Vá em **Settings → Pages**. Em *Branch*, escolha **main** e **/ (root)** e clique em **Save**.
6. Espere 1–2 minutos. O endereço aparece no topo da página, algo como:
   `https://SEU-USUARIO.github.io/meu-app-saude/`

## 2. Instalar no iPhone

1. Abra o endereço no **Safari**. Precisa ser o Safari.
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. Pronto: o ícone aparece na tela e o app abre em tela cheia.

## 3. Configurar

1. Aba **Perfil**: preencha seus dados e toque em **Calcular metas**.
2. Para usar foto, descrição e resumo de artigos com IA:
   - Acesse **aistudio.google.com** → **Get API key** → **Create API key**.
   - Cole a chave em **Perfil → Inteligência artificial** e toque em **Testar**.
   - Se aparecer erro de modelo, troque o campo *Modelo* por outro listado no AI Studio (ex: `gemini-2.5-flash`).

---

## Como usar no dia a dia

| Aba | O que fazer |
|---|---|
| **Hoje** | Registre o que comeu: **Buscar** (mais preciso, pesando a comida), **Foto** ou **Descrever** (mais rápido, porém aproximado). Toque em ‹ › para ver outros dias. |
| **Treino** | Gere o plano uma vez. Em cada treino, toque em **▶ Treinar** e anote carga e reps. O app mostra o que você fez da última vez, para você tentar superar. |
| **Peso** | Pese-se de manhã, em jejum, de 3 a 7 vezes por semana. Depois de 2 semanas o app compara as médias e sugere ajustar a meta. |
| **Artigos** | Busque temas (em inglês) e toque em **Resumir em português**. |

## Base científica usada

- **Gasto basal:** equação de Mifflin-St Jeor (1990).
- **Recomposição:** déficit de ~15% e proteína de 2,0 g/kg. Morton et al. (2018) e Helms et al. (2014).
- **Perda ideal:** 0,5–1% do peso corporal por semana. Acima disso, aumenta o risco de perder músculo.
- **Treino:** 10–20 séries por músculo por semana (Schoenfeld et al., 2017), cada músculo 2x/semana (Schoenfeld et al., 2016), séries a 1–3 reps da falha e progressão dupla.

## Privacidade e backup

- Todos os seus dados ficam **só no iPhone** (armazenamento do Safari). Nada vai para o GitHub.
- Ao usar foto, descrição ou resumo, o conteúdo enviado vai para o Google (Gemini). No plano gratuito, o Google pode usar esses dados para melhorar os modelos dele.
- Faça **Perfil → Backup → Exportar** de vez em quando e salve no app Arquivos ou no iCloud.
- Atenção: se você ficar muitas semanas sem abrir o app, o iOS pode apagar os dados de sites. Usar pela tela de início reduz esse risco, mas mantenha o backup em dia.

## Como modificar o app

| Arquivo | O que tem |
|---|---|
| `index.html` | Estrutura das telas |
| `style.css` | Cores e visual (as cores ficam no topo, em `:root`) |
| `app.js` | Toda a lógica. Fácil de mudar: `OBJETIVOS` (déficit e proteína), `EXS` (exercícios), `DIVISOES` (divisão de treino), `SUGESTOES` (temas de artigos) |
| `taco.js` | Tabela TACO (597 alimentos) |
| `sw.js` | Funcionamento offline |

**Depois de editar:** envie os arquivos alterados para o GitHub (Add file → Upload files) e **aumente a versão** em `sw.js` (`saude-v1` → `saude-v2`). No iPhone, feche e abra o app duas vezes para pegar a atualização.

Para testar no computador antes de publicar, rode na pasta do app:

    python -m http.server 8000

e abra `http://localhost:8000`.

---

*Ferramenta pessoal. Não substitui médico ou nutricionista.*
