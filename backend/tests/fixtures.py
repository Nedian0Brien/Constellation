from pathlib import Path
from constellation.db import store


def populate(path: Path):
    c = store.connect(path)
    c.execute("INSERT INTO runs (run_id,kind,created_at) VALUES ('a','project',CURRENT_TIMESTAMP),('b','project',CURRENT_TIMESTAMP)")
    c.execute("INSERT INTO works (id,title,abstract,year,cited_by_count,has_abstract,source,collected_at) VALUES "
              "('1','Alpha retrieval','First abstract',2020,10,true,'test',CURRENT_TIMESTAMP),"
              "('2','Beta retrieval',NULL,NULL,10,false,'test',CURRENT_TIMESTAMP),"
              "('3','Gamma','RETRIEVAL evidence',2022,NULL,true,'test',CURRENT_TIMESTAMP),"
              "('4','Other run','retrieval',2020,100,true,'test',CURRENT_TIMESTAMP),"
              "('5','100% exact','literal query',2010,1,true,'test',CURRENT_TIMESTAMP)")
    c.execute("INSERT INTO projections(run_id,work_id,x,y) VALUES ('a','1',0,0),('a','2',1,1),('a','3',2,2),('b','4',0,0),('a','5',3,3)")
    c.close()
