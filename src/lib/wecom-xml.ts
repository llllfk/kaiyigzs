export function extractXmlTag(xml: string, tag: string): string {
  const cdata = xml.match(
    new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  );
  if (cdata?.[1] != null) return cdata[1].trim();

  const plain = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return plain?.[1]?.trim() ?? '';
}

export type WecomTemplateCardEvent = {
  msgType: string;
  event: string;
  eventKey: string;
  taskId: string;
  cardType: string;
  responseCode: string;
  fromUser: string;
  agentId: string;
  createTime: string;
};

export function parseWecomXmlMessage(xml: string): WecomTemplateCardEvent {
  return {
    msgType: extractXmlTag(xml, 'MsgType'),
    event: extractXmlTag(xml, 'Event'),
    eventKey: extractXmlTag(xml, 'EventKey'),
    taskId: extractXmlTag(xml, 'TaskId'),
    cardType: extractXmlTag(xml, 'CardType'),
    responseCode: extractXmlTag(xml, 'ResponseCode'),
    fromUser: extractXmlTag(xml, 'FromUserName'),
    agentId: extractXmlTag(xml, 'AgentID'),
    createTime: extractXmlTag(xml, 'CreateTime'),
  };
}

export function alarmButtonLabel(eventKey: string): string {
  switch (eventKey) {
    case 'alarm_accept':
      return '已接手';
    case 'alarm_done':
      return '已处理';
    case 'alarm_false':
      return '已标记误报';
    case 'alarm_escalate':
      return '已升级';
    default:
      return `已操作(${eventKey || 'unknown'})`;
  }
}
