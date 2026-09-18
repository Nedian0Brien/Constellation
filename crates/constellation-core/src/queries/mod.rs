//! 화면이 부르는 질의. 함수 하나가 FastAPI 엔드포인트 하나에 대응한다.
//! 반환 구조체의 필드 이름·형은 Python 버전의 JSON과 같다.

mod clusters;
mod edges;
mod flow;
mod lineage;
mod map;
mod runs;
mod tree;
mod works;

pub use clusters::{cluster_detail, clusters, ClusterDetail, ClusterInfo, YearCount};
pub use edges::{edges, EdgesData};
pub use flow::{flow, flow_papers, FlowCluster, FlowData, FlowEdge, FlowWindow};
pub use lineage::{lineage, LineageData, LineageEdge, LineageNode};
pub use map::{map, MapData};
pub use runs::{health, runs, Health, RunInfo};
pub use tree::{tree, TreeData, TreeNode};
pub use works::{
    citations, matches, work, works, Citations, CitedWork, Direction, Matches, Order, PaperFilter,
    PaperPage, PaperRow, Sort, Topic, Work,
};

/// 피인용 상위 목록 한 줄. 주제 상세·갈래 상세가 같이 쓴다.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct WorkBrief {
    pub id: String,
    pub title: String,
    pub year: Option<i32>,
    pub cited: i32,
}
