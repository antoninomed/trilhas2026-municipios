# Trilhas 2026: Mapa de Alcance

Dashboard em HTML, CSS e JavaScript puro usando Leaflet para exibir ocorrências por cidade no Maranhão.

## Como configurar a planilha

1. No Google Sheets, deixe a planilha pública ou publique a aba como CSV.
2. Abra `script.js`.
3. Cole o link na variável:

```js
GOOGLE_SHEETS_URL: "COLE_AQUI_O_LINK_DA_SUA_PLANILHA",
```

4. Ajuste o nome da coluna da cidade:

```js
CITY_COLUMN_NAME: "Cidade",
```

Se sua planilha já tiver uma coluna com quantidade, preencha também:

```js
COUNT_COLUMN_NAME: "Ocorrências",
```

Se cada linha representa uma inscrição/ocorrência, deixe `COUNT_COLUMN_NAME` vazio.

## Rodar localmente

Como o dashboard usa `fetch`, rode com um servidor local:

```bash
python -m http.server 5500
```

Depois acesse:

```text
http://localhost:5500
```

## Observação de segurança

Este dashboard é 100% front-end. O link da planilha fica visível no código para qualquer pessoa que abrir a página. Não use dados pessoais ou sensíveis em planilhas públicas. Para dados privados, use um backend/API intermediária com autenticação.
