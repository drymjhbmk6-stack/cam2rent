import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { marked, type Token, type Tokens } from 'marked';

// ─── Farben (gleicher Stil wie Vertrags-PDF) ─────────────────────────────────

const NAVY = '#0f172a';
const CYAN = '#06b6d4';
const GRAY = '#6b7280';
const DARK = '#1a1a1a';
const LIGHT_BG = '#f8fafc';

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  headerBar: {
    backgroundColor: NAVY,
    marginHorizontal: -48,
    marginTop: -40,
    paddingHorizontal: 48,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    letterSpacing: 1,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerLabel: {
    fontSize: 8,
    color: CYAN,
    marginBottom: 2,
  },
  headerValue: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
  },
  footerBar: {
    height: 2,
    backgroundColor: CYAN,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: GRAY,
  },
  // Markdown-Elemente
  h1: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 3,
    borderBottomWidth: 2,
    borderBottomColor: CYAN,
  },
  h2: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: CYAN,
  },
  h3: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 8.5,
    color: '#374151',
    lineHeight: 1.6,
    marginBottom: 6,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  link: {
    color: CYAN,
    textDecoration: 'underline',
  },
  listItem: {
    fontSize: 8.5,
    color: '#374151',
    lineHeight: 1.6,
    marginBottom: 3,
    paddingLeft: 12,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginVertical: 10,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: CYAN,
    paddingLeft: 10,
    marginVertical: 6,
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderRadius: 2,
  },
  codeBlock: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderRadius: 2,
    marginVertical: 6,
    color: DARK,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  tableCell: {
    fontSize: 8,
    color: DARK,
  },
});

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerBar} />
      <View style={s.footerRow}>
        <Text style={s.footerText}>
          cam2rent {'\u2013'} {BUSINESS.owner} {'\u2013'} {BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city}
        </Text>
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Seite ${pageNumber} von ${totalPages}`
          }
        />
      </View>
    </View>
  );
}

// ─── Inline-Text Parser ──────────────────────────────────────────────────────

function renderInlineTokens(tokens: Token[]): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'strong':
        return (
          <Text key={i} style={s.bold}>
            {renderInlineTokens((token as Tokens.Strong).tokens)}
          </Text>
        );
      case 'em':
        return (
          <Text key={i} style={s.italic}>
            {renderInlineTokens((token as Tokens.Em).tokens)}
          </Text>
        );
      case 'link':
        return (
          <Link key={i} src={(token as Tokens.Link).href} style={s.link}>
            {(token as Tokens.Link).text}
          </Link>
        );
      case 'codespan':
        return (
          <Text key={i} style={{ fontFamily: 'Courier', fontSize: 7.5, backgroundColor: '#f1f5f9' }}>
            {(token as Tokens.Codespan).text}
          </Text>
        );
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          return <Text key={i}>{renderInlineTokens(t.tokens)}</Text>;
        }
        return <Text key={i}>{t.text}</Text>;
      }
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      default:
        if ('text' in token) {
          return <Text key={i}>{(token as { text: string }).text}</Text>;
        }
        return null;
    }
  });
}

// ─── Block-Level Renderer ────────────────────────────────────────────────────

function renderTokens(tokens: Token[]): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'heading': {
        const h = token as Tokens.Heading;
        const style = h.depth === 1 ? s.h1 : h.depth === 2 ? s.h2 : s.h3;
        return (
          <Text key={i} style={style}>
            {renderInlineTokens(h.tokens)}
          </Text>
        );
      }

      case 'paragraph': {
        const p = token as Tokens.Paragraph;
        return (
          <Text key={i} style={s.paragraph}>
            {renderInlineTokens(p.tokens)}
          </Text>
        );
      }

      case 'list': {
        const list = token as Tokens.List;
        return (
          <View key={i} style={{ marginBottom: 6 }}>
            {list.items.map((item: Tokens.ListItem, j: number) => (
              <Text key={j} style={s.listItem}>
                {list.ordered ? `${j + 1}. ` : '\u2022 '}
                {renderInlineTokens(
                  item.tokens.flatMap((t: Token) =>
                    t.type === 'text' ? [(t as Tokens.Text)] :
                    t.type === 'paragraph' ? (t as Tokens.Paragraph).tokens :
                    [t]
                  )
                )}
              </Text>
            ))}
          </View>
        );
      }

      case 'blockquote': {
        const bq = token as Tokens.Blockquote;
        return (
          <View key={i} style={s.blockquote}>
            {renderTokens(bq.tokens)}
          </View>
        );
      }

      case 'code': {
        const code = token as Tokens.Code;
        return (
          <Text key={i} style={s.codeBlock}>
            {code.text}
          </Text>
        );
      }

      case 'table': {
        const table = token as Tokens.Table;
        const colCount = table.header.length;
        const colWidth = `${Math.floor(100 / colCount)}%`;
        return (
          <View key={i} style={s.tableContainer}>
            <View style={s.tableHeaderRow}>
              {table.header.map((cell: Tokens.TableCell, c: number) => (
                <Text key={c} style={[s.tableHeaderCell, { width: colWidth }]}>
                  {cell.text}
                </Text>
              ))}
            </View>
            {table.rows.map((row: Tokens.TableCell[], r: number) => (
              <View
                key={r}
                style={[s.tableRow, { backgroundColor: r % 2 === 1 ? '#f1f5f9' : '#ffffff' }]}
              >
                {row.map((cell: Tokens.TableCell, c: number) => (
                  <Text key={c} style={[s.tableCell, { width: colWidth }]}>
                    {cell.text}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      }

      case 'hr':
        return <View key={i} style={s.hr} />;

      case 'space':
        return null;

      default:
        if ('text' in token) {
          return (
            <Text key={i} style={s.paragraph}>
              {(token as { text: string }).text}
            </Text>
          );
        }
        return null;
    }
  });
}

// ─── Markdown → Tokens ───────────────────────────────────────────────────────

function parseMarkdown(content: string): Token[] {
  return marked.lexer(content);
}

// ─── PDF-Dokument ────────────────────────────────────────────────────────────

export interface LegalPDFData {
  title: string;
  slug: string;
  content: string;
  versionNumber: number;
  publishedAt: string | null;
}

export function LegalDocumentPDF({ data }: { data: LegalPDFData }) {
  const tokens = parseMarkdown(data.content);
  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;

  const standDatum = data.publishedAt
    ? new Date(data.publishedAt).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    : dateStr;

  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page} wrap>
        <Footer />

        {/* Header */}
        <View style={s.headerBar}>
          <View>
            <Text style={s.headerTitle}>{data.title}</Text>
            <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>
              cam2rent {'\u2013'} Action-Cam Verleih
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Stand</Text>
            <Text style={s.headerValue}>{standDatum}</Text>
            <Text style={[s.headerLabel, { marginTop: 4 }]}>Version</Text>
            <Text style={[s.headerValue, { color: CYAN }]}>{data.versionNumber}</Text>
          </View>
        </View>

        {/* Inhalt aus Markdown-Tokens */}
        {renderTokens(tokens)}

        {/* Kontakt-Box */}
        <View style={{
          backgroundColor: LIGHT_BG,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 4,
          padding: 10,
          marginTop: 16,
        }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
            Kontakt
          </Text>
          <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.6 }}>
            {BUSINESS.name} {'\u2013'} {BUSINESS.owner}
          </Text>
          <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.6 }}>
            {BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city}
          </Text>
          <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.6 }}>
            E-Mail: {BUSINESS.emailKontakt} | Tel.: {BUSINESS.phone}
          </Text>
          <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.6 }}>
            Web: www.{BUSINESS.domain}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
