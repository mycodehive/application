# TossInvest MCP Server

Hermes에서 사용할 수 있는 **Toss Securities Open API MCP(Model Context Protocol) Server**입니다.

OAuth 인증을 자동으로 처리하며 다음 기능을 제공합니다.

* OAuth Access Token 관리
* 주식 시세 조회
* 보유 종목 조회
* 임의(OpenAPI 문서 기준)의 REST API 호출
* Hermes Agent에서 Tool 형태로 사용

---

# Architecture

```
Hermes Agent
      │
      ▼
 FastMCP Server
      │
      ├── OAuth Token Cache
      ├── Quote API
      ├── Holdings API
      └── Raw REST API
               │
               ▼
Toss Securities Open API
```

---

# Features

| Tool             | 설명                    |
| ---------------- | --------------------- |
| health_check     | 환경설정 및 인증 상태 확인       |
| get_access_token | Access Token 발급 또는 갱신 |
| get_quotes       | 종목 시세 조회              |
| get_holdings     | 보유종목 조회               |
| raw_api          | 임의 OpenAPI 호출         |

---

# Requirements

* Python 3.11+
* httpx
* fastmcp
* Toss Securities Open API 계정

설치

```bash
pip install httpx fastmcp
```

---

# Environment Variables

필수

```bash
export TOSSINVEST_CLIENT_ID=xxxxxxxx
export TOSSINVEST_CLIENT_SECRET=xxxxxxxx
```

선택

```bash
export TOSSINVEST_BASE_URL=https://openapi.tossinvest.com
export TOSSINVEST_ACCOUNT=1
```

| 변수                       | 설명              |
| ------------------------ | --------------- |
| TOSSINVEST_CLIENT_ID     | OAuth Client ID |
| TOSSINVEST_CLIENT_SECRET | OAuth Secret    |
| TOSSINVEST_BASE_URL      | API Endpoint    |
| TOSSINVEST_ACCOUNT       | 기본 계좌번호         |

---

# Run

```bash
python tossinvest_mcp.py
```

FastMCP Server가 stdio 모드로 실행됩니다.

---

# Hermes 등록

예시

```json
{
  "mcpServers": {
    "tossinvest": {
      "command": "python",
      "args": [
        "/path/to/tossinvest_mcp.py"
      ],
      "env": {
        "TOSSINVEST_CLIENT_ID": "...",
        "TOSSINVEST_CLIENT_SECRET": "...",
        "TOSSINVEST_ACCOUNT": "1"
      }
    }
  }
}
```

---

# Usage

## 1. 서버 상태 확인

```
health_check()
```

예시 결과

```json
{
  "configured": true,
  "default_account": "1",
  "token": {
    "cached": true
  }
}
```

---

## 2. Access Token 발급

```
get_access_token()
```

강제 갱신

```
get_access_token(force_refresh=True)
```

---

## 3. 시세 조회

```
get_quotes("005930")
```

복수 종목

```
get_quotes("005930,000660")
```

---

## 4. 보유 종목 조회

기본 계좌

```
get_holdings()
```

특정 계좌

```
get_holdings(account="2")
```

---

## 5. 임의 API 호출

예시

```
raw_api(
    method="GET",
    path="/api/v1/stocks",
    params_json='{"symbols":"005930"}'
)
```

POST 예시

```
raw_api(
    method="POST",
    path="/api/v1/example",
    body_json='{"price":1000}'
)
```

---

# Token Cache

OAuth Token은 메모리에 캐시됩니다.

동작 방식

* 최초 호출 시 Token 발급
* 만료 30초 전까지 재사용
* 만료 시 자동 갱신
* force_refresh=True로 강제 재발급 가능

---

# Error Handling

다음 상황에서 예외가 발생합니다.

* 환경변수 누락
* OAuth 실패
* HTTP 오류
* 잘못된 JSON
* OpenAPI 오류 응답

오류 응답 예

```json
{
    "status_code":400,
    "url":"...",
    "response":{}
}
```

---

# Security

* Client Secret은 Tool 결과에 노출되지 않습니다.
* OAuth Token은 메모리에만 저장됩니다.
* Authorization Header는 내부적으로 자동 생성됩니다.
* 계좌번호는 HTTP Header(X-Tossinvest-Account)로 전달됩니다.

---

# 프로젝트 구조

```
tossinvest_mcp.py
│
├── OAuth
│   ├── Token Cache
│   └── Authorization Header
│
├── REST Helper
│   └── _request()
│
├── MCP Tools
│   ├── health_check
│   ├── get_access_token
│   ├── get_quotes
│   ├── get_holdings
│   └── raw_api
│
└── FastMCP Entry Point
```

---

# 확장 예시

다음 기능을 쉽게 추가할 수 있습니다.

* 주문(매수/매도)
* 주문취소
* 주문가능금액 조회
* 체결내역 조회
* 잔고평가
* 실시간 시세(WebSocket)
* 조건검색
* ETF 정보
* 해외주식 API
* 자동매매 전략 Tool

---

# License

본 프로젝트는 Toss Securities Open API 이용약관을 준수하여 사용해야 합니다.
