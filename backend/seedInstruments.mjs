import 'dotenv/config';
import pool from './config/db.mjs';
import crypto from 'crypto';

const instruments = [
  { symbol: 'HDFCBANK',   company: 'HDFC Bank Ltd',                   sector: 'Banking',      price: 167825, domain: 'hdfcbank.com'       },
  { symbol: 'ICICIBANK',  company: 'ICICI Bank Ltd',                  sector: 'Banking',      price: 124530, domain: 'icicibank.com'      },
  { symbol: 'SBIN',       company: 'State Bank of India',             sector: 'Banking',      price: 81245,  domain: 'sbi.co.in'          },
  { symbol: 'KOTAKBANK',  company: 'Kotak Mahindra Bank Ltd',         sector: 'Banking',      price: 178960, domain: 'kotak.com'          },
  { symbol: 'AXISBANK',   company: 'Axis Bank Ltd',                   sector: 'Banking',      price: 112375, domain: 'axisbank.com'       },
  { symbol: 'INDUSINDBK', company: 'IndusInd Bank Ltd',               sector: 'Banking',      price: 145635, domain: 'indusind.com'       },
  { symbol: 'BAJFINANCE', company: 'Bajaj Finance Ltd',               sector: 'Finance',      price: 723490, domain: 'bajajfinserv.com'   },
  { symbol: 'BAJAJFINSV', company: 'Bajaj Finserv Ltd',               sector: 'Finance',      price: 167835, domain: 'bajajfinserv.com'   },

  { symbol: 'HDFCLIFE',   company: 'HDFC Life Insurance Co Ltd',      sector: 'Insurance',    price: 68945,  domain: 'hdfclife.com'       },
  { symbol: 'SBILIFE',    company: 'SBI Life Insurance Co Ltd',       sector: 'Insurance',    price: 167820, domain: 'sbilife.in'         },
  { symbol: 'ICICIPRULI', company: 'ICICI Prudential Life Insurance', sector: 'Insurance',    price: 72345,  domain: 'iciciprulife.com'   },
  { symbol: 'ICICIGI',    company: 'ICICI Lombard General Insurance', sector: 'Insurance',    price: 186730, domain: 'icicilombard.com'   },

  { symbol: 'TCS',        company: 'Tata Consultancy Services Ltd',   sector: 'IT',           price: 382140, domain: 'tcs.com'            },
  { symbol: 'INFY',       company: 'Infosys Ltd',                     sector: 'IT',           price: 183460, domain: 'infosys.com'        },
  { symbol: 'WIPRO',      company: 'Wipro Ltd',                       sector: 'IT',           price: 56730,  domain: 'wipro.com'          },
  { symbol: 'HCLTECH',    company: 'HCL Technologies Ltd',            sector: 'IT',           price: 167830, domain: 'hcltech.com'        },
  { symbol: 'TECHM',      company: 'Tech Mahindra Ltd',               sector: 'IT',           price: 156780, domain: 'techmahindra.com'   },

  { symbol: 'RELIANCE',   company: 'Reliance Industries Ltd',         sector: 'Energy',       price: 245675, domain: 'ril.com'            },
  { symbol: 'ONGC',       company: 'Oil & Natural Gas Corporation',   sector: 'Energy',       price: 28945,  domain: 'ongcindia.com'      },
  { symbol: 'BPCL',       company: 'Bharat Petroleum Corporation',    sector: 'Energy',       price: 34580,  domain: 'bharatpetroleum.in' },
  { symbol: 'POWERGRID',  company: 'Power Grid Corporation of India', sector: 'Energy',       price: 33425,  domain: 'powergridindia.com' },
  { symbol: 'NTPC',       company: 'NTPC Ltd',                        sector: 'Energy',       price: 37890,  domain: 'ntpc.co.in'         },
  { symbol: 'COALINDIA',  company: 'Coal India Ltd',                  sector: 'Energy',       price: 47835,  domain: 'coalindia.in'       },

  { symbol: 'HINDUNILVR', company: 'Hindustan Unilever Ltd',          sector: 'FMCG',         price: 238915, domain: 'hul.co.in'          },
  { symbol: 'ITC',        company: 'ITC Ltd',                         sector: 'FMCG',         price: 45680,  domain: 'itcportal.com'      },
  { symbol: 'NESTLEIND',  company: 'Nestle India Ltd',                sector: 'FMCG',         price: 234560, domain: 'nestle.in'          },
  { symbol: 'BRITANNIA',  company: 'Britannia Industries Ltd',        sector: 'FMCG',         price: 567845, domain: 'britannia.co.in'    },
  { symbol: 'TATACONSUM', company: 'Tata Consumer Products Ltd',      sector: 'FMCG',         price: 112365, domain: 'tataconsumer.com'   },
  { symbol: 'PIDILITIND', company: 'Pidilite Industries Ltd',         sector: 'FMCG',         price: 298765, domain: 'pidilite.com'       },
  
  { symbol: 'SUNPHARMA',  company: 'Sun Pharmaceutical Industries',   sector: 'Pharma',       price: 156745, domain: 'sunpharma.com'      },
  { symbol: 'DRREDDY',    company: 'Dr. Reddys Laboratories Ltd',     sector: 'Pharma',       price: 678940, domain: 'drreddys.com'       },
  { symbol: 'CIPLA',      company: 'Cipla Ltd',                       sector: 'Pharma',       price: 156725, domain: 'cipla.com'          },
  { symbol: 'DIVISLAB',   company: 'Divis Laboratories Ltd',          sector: 'Pharma',       price: 456790, domain: 'divislaboratories.com'},
  { symbol: 'APOLLOHOSP', company: 'Apollo Hospitals Enterprise Ltd', sector: 'Healthcare',   price: 678930, domain: 'apollohospitals.com'},

  { symbol: 'MARUTI',     company: 'Maruti Suzuki India Ltd',         sector: 'Auto',         price: 1245680,domain: 'marutisuzuki.com'   },
  { symbol: 'TATAMOTORS', company: 'Tata Motors Ltd',                 sector: 'Auto',         price: 102345, domain: 'tatamotors.com'     },
  { symbol: 'M&M',        company: 'Mahindra & Mahindra Ltd',         sector: 'Auto',         price: 234570, domain: 'mahindra.com'       },
  { symbol: 'BAJAJ-AUTO', company: 'Bajaj Auto Ltd',                  sector: 'Auto',         price: 987645, domain: 'bajajauto.com'      },
  { symbol: 'HEROMOTOCO', company: 'Hero MotoCorp Ltd',               sector: 'Auto',         price: 523460, domain: 'heromotocorp.com'   },
  { symbol: 'EICHERMOT',  company: 'Eicher Motors Ltd',               sector: 'Auto',         price: 482375, domain: 'eichergroup.com'    },

  { symbol: 'TATASTEEL',  company: 'Tata Steel Ltd',                  sector: 'Metals',       price: 17845,  domain: 'tatasteel.com'      },
  { symbol: 'JSWSTEEL',   company: 'JSW Steel Ltd',                   sector: 'Metals',       price: 93460,  domain: 'jsw.in'             },
  { symbol: 'GRASIM',     company: 'Grasim Industries Ltd',           sector: 'Materials',    price: 267890, domain: 'grasim.com'         },
  { symbol: 'ULTRACEMCO', company: 'UltraTech Cement Ltd',            sector: 'Materials',    price: 1023455,domain: 'ultratechcement.com' },
  { symbol: 'ASIANPAINT', company: 'Asian Paints Ltd',                sector: 'Materials',    price: 287640, domain: 'asianpaints.com'    },

  { symbol: 'BHARTIARTL', company: 'Bharti Airtel Ltd',               sector: 'Telecom',      price: 156735, domain: 'airtel.in'          },

  { symbol: 'ADANIENT',   company: 'Adani Enterprises Ltd',           sector: 'Conglomerate', price: 298765, domain: 'adani.com'          },
  { symbol: 'ADANIPORTS', company: 'Adani Ports & SEZ Ltd',           sector: 'Conglomerate', price: 134580, domain: 'adaniports.com'     },
  { symbol: 'LT',         company: 'Larsen & Toubro Ltd',             sector: 'Conglomerate', price: 345625, domain: 'larsentoubro.com'   },

  { symbol: 'TITAN',      company: 'Titan Company Ltd',               sector: 'Consumer',     price: 367890, domain: 'titancompany.in'    },
];

const SECTOR_COLORS = {
  'Banking':      '#1565c0',
  'Finance':      '#0277bd',
  'Insurance':    '#00695c',
  'IT':           '#6a1b9a',
  'Energy':       '#e65100',
  'FMCG':         '#2e7d32',
  'Pharma':       '#ad1457',
  'Healthcare':   '#c62828',
  'Auto':         '#4527a0',
  'Metals':       '#37474f',
  'Materials':    '#558b2f',
  'Telecom':      '#00838f',
  'Conglomerate': '#4e342e',
  'Consumer':     '#f9a825',
};

async function seed() {
  console.log('\nSeeding instruments with sectors...\n');

  const FIXED_IDS = {
    'RELIANCE': 'aaaa0001-0000-0000-0000-000000000001',
    'INFY':     'aaaa0002-0000-0000-0000-000000000002',
  };

  let inserted = 0;
  let updated  = 0;

  for (const inst of instruments) {
    const id = FIXED_IDS[inst.symbol] || crypto.randomUUID();

    // INSERT IGNORE keeps existing rows intact
    const [result] = await pool.query(
      `INSERT IGNORE INTO instruments
         (id, symbol, company_name, exchange, instrument_type, lot_size, sector, domain, is_active)
       VALUES (?, ?, ?, 'NSE', 'EQUITY', 1, ?, ?, TRUE)`,
      [id, inst.symbol, inst.company, inst.sector, inst.domain || null]
    );

    if (result.affectedRows === 1) {
      inserted++;
    } else {
      await pool.query(
        'UPDATE instruments SET sector = ?, domain = ? WHERE symbol = ?',
        [inst.sector, inst.domain || null, inst.symbol]
      );
      updated++;
    }
  }

  console.log(`Done. ${inserted} inserted, ${updated} updated.`);
  console.log('\nSector color map (copy to frontend constants):');
  console.log(JSON.stringify(SECTOR_COLORS, null, 2));
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});