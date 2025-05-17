  // 초기 마인드맵 데이터
  const mind_data = {
    meta: { name: "demo", author: "you", version: "1.0" },
    format: "node_tree",
    data: {
      id: "root",
      topic: "중심 아이디어",
      children: []
    }
  };

  // 옵션
  const options = {
    container: 'jsmind_container',
    editable: true,
    view: { engine: 'canvas' }
  };

  // 인스턴스 생성
  let jm = jsMind.show(options, mind_data);

  // 노드 추가 헬퍼
  function addChild() {
    const node = jm.get_selected_node();
    const parent_id = node ? node.id : 'root';
    const new_id = parent_id + '_' + Date.now();
    jm.add_node(parent_id, new_id, '새 노드');
    jm.select_node(new_id);
  }
  function addSibling() {
    const node = jm.get_selected_node();
    if (!node || node.id === 'root') {
      alert('루트의 형제 노드는 생성할 수 없습니다.');
      return;
    }
    const parent_id = node.parent;
    const new_id = parent_id + '_' + Date.now();
    jm.add_node(parent_id, new_id, '새 노드');
    jm.select_node(new_id);
  }
  function deleteNode() {
    const node = jm.get_selected_node();
    if (!node || node.id === 'root') {
      alert('루트 노드는 삭제할 수 없습니다.');
      return;
    }
    jm.remove_node(node.id);
    jm.select_node('root');
  }

  // 이벤트 바인딩
  document.getElementById('btn_add_child').addEventListener('click', addChild);
  document.getElementById('btn_add_sibling').addEventListener('click', addSibling);
  document.getElementById('btn_del_node').addEventListener('click', deleteNode);

  // 저장/불러오기/내보내기/가져오기
  document.getElementById('btn_save').addEventListener('click', () => {
    localStorage.setItem('mymind', JSON.stringify(jm.get_data()));
    alert('저장 완료');
  });
  document.getElementById('btn_load').addEventListener('click', () => {
    const json = localStorage.getItem('mymind');
    if (json) {
      jm = jsMind.show(options, JSON.parse(json));
      alert('불러오기 완료');
    } else alert('저장된 데이터가 없습니다');
  });
  document.getElementById('btn_export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(jm.get_data())], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'mindmap.json'; a.click();
  });
  document.getElementById('btn_import').addEventListener('click', () => {
    document.getElementById('file_input').click();
  });
  document.getElementById('file_input').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      jm = jsMind.show(options, JSON.parse(e.target.result));
    };
    reader.readAsText(file);
  });