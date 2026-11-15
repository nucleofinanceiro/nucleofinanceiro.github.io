# Núcleo Financeiro

App web de acompanhamento financeiro para pequenas empresas: lançamentos, impostos, pró-labore com INSS e IRRF de 2026, extratos bancários com importação de OFX e CSV, e várias empresas por usuário com convites para sócios e contador.

Funciona no navegador e pode ser instalado no celular como app. Os dados ficam no Supabase, protegidos por regras no próprio banco: cada pessoa só enxerga as empresas das quais é membro.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `schema.sql` | Cria tabelas, regras de acesso e o espaço dos arquivos no Supabase |
| `config.js` | Onde você cola a URL e a chave do seu projeto Supabase |
| `index.html`, `styles.css`, `app.js` | O app |
| `manifest.webmanifest`, `sw.js`, `icons/` | Instalação no celular |

## Passo a passo para publicar (cerca de 30 minutos)

### 1. Banco de dados no Supabase
1. Em supabase.com, crie um projeto. Escolha a região **South America (São Paulo)** e guarde a senha do banco.
2. Quando o projeto terminar de criar, abra **SQL Editor** › **New query**.
3. Abra o arquivo `schema.sql`, copie tudo, cole no editor e clique em **Run**. Deve aparecer "Success. No rows returned".

### 2. Chaves do projeto
1. No Supabase, clique em **Connect** (no topo) ou vá em **Project Settings › API Keys**.
2. Copie a **Project URL** (algo como `https://abcdxyz.supabase.co`).
3. Copie a chave **publishable** (começa com `sb_publishable_`). Se o app mostrar erro de chave, use a chave **anon** da aba "Legacy API keys".
4. Abra `config.js` e cole os dois valores no lugar indicado.

Nunca use a chave `service_role` ou `secret` nesse arquivo. A chave publishable/anon pode ficar pública: quem protege os dados são as regras do `schema.sql`.

### 3. Publicar no GitHub Pages
1. No GitHub, clique em **New repository**. Nome sugerido: `financeiro`. Deixe como **Public** (o GitHub Pages gratuito exige repositório público; o código fica visível, os dados não).
2. Na página do repositório, clique em **uploading an existing file** e arraste todos os arquivos e a pasta `icons`. Clique em **Commit changes**.
3. Vá em **Settings › Pages**. Em "Build and deployment", escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em um ou dois minutos o endereço aparece no topo da página, por exemplo `https://seu-usuario.github.io/financeiro/`.

### 4. Ligar o login ao endereço do app
No Supabase, vá em **Authentication › URL Configuration**:
- **Site URL**: o endereço do GitHub Pages (com a barra no final).
- **Redirect URLs**: adicione o mesmo endereço.

Sem isso, os links de confirmação de e-mail e de troca de senha levam para o lugar errado.

### 5. E-mails de confirmação
O envio de e-mail embutido do Supabase serve para testes e manda poucos e-mails por hora. Antes de chamar clientes:
- Em **Authentication › Emails › SMTP Settings**, configure um serviço de e-mail (Resend, Brevo ou o e-mail do seu domínio).
- Em **Authentication › Emails › Templates**, traduza os textos de "Confirm signup" e "Reset password" para português.

Para testar sozinho antes disso, dá para desligar a confirmação em **Authentication › Sign In / Providers › Email › Confirm email**. Religue antes de abrir para outras pessoas.

### 6. Primeiro uso
1. Abra o endereço do app, clique em **Criar conta** e confirme o e-mail.
2. Cadastre a empresa (ex.: Núcleo Podcast & Editora). Você vira o dono.
3. Em **Empresa e acesso**, confira os sócios, o anexo do Simples e gere convites:
   - **Editor**: lança, anexa extratos e registra pró-labore (ex.: o Rian).
   - **Somente leitura**: só consulta (ex.: contador de um cliente).
4. Mande o link do convite. A pessoa cria a conta e entra direto na empresa.

### 7. Instalar no celular
- **iPhone (Safari):** abra o endereço, toque em Compartilhar › Adicionar à Tela de Início.
- **Android (Chrome):** abra o endereço e toque em **Instalar app** (ou menu › Adicionar à tela inicial).

## Atualizar o app
Edite o arquivo direto no GitHub (ícone de lápis) ou envie a nova versão por upload e faça commit. O GitHub Pages republica sozinho em um ou dois minutos.

Se um dia alterar o `schema.sql`, rode de novo no SQL Editor. Ele foi escrito para poder ser executado mais de uma vez sem apagar dados.

## Bom saber
- **Plano gratuito do Supabase:** projetos sem nenhum acesso por 7 dias são pausados (dá para reativar no painel). Com uso real de clientes, considere o plano Pro.
- **Cópia de segurança:** o plano gratuito não tem backup com restauração automática. Use **Lançamentos › Baixar CSV** com "Ano inteiro" periodicamente.
- **Open Finance:** com o app no Supabase, a conexão automática pode ser adicionada depois com uma Edge Function e um agregador como a Pluggy.
- **Parâmetros de 2026:** INSS 11% até o teto de R$ 8.475,55; IRRF pela tabela progressiva com a redução da Lei 15.270/2025. Atualize em **Empresa e acesso** quando mudarem.
