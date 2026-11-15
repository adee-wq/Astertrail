import torch, json, os, random
import numpy as np
from model import Interp, norm
from synth import batch

CFG = dict(seed=0, dev='cuda', B=768, steps=40000, lr=1e-4, wd=3e-6, warm=200,
           clip=1.0, log_every=50, val_every=200, ckpt_every=200,
           m=256, h=256, out='runs/varnet')

def seed_all(s):
    random.seed(s); np.random.seed(s); torch.manual_seed(s); torch.cuda.manual_seed_all(s)

def amp(dev):
    return torch.autocast(device_type='cuda', dtype=torch.bfloat16, enabled=dev == 'cuda')

def wnll(m, d):
    mu, ls, med, iqr = m(d['x'], d['t'], d['mask'], d['t'])
    yn = norm(d['y'], med, iqr)
    l = 0.5 * ((yn - mu) * (-ls).exp())**2 + ls
    h = 1 - d['mask']
    return (l * h).sum() / h.sum().clamp(min=1)

@torch.no_grad()
def evaluate(m, v, dev):
    m.eval()
    with amp(dev):
        nll = wnll(m, v).item()
        pm, _ = m.predict(v['x'], v['t'], v['mask'], v['t'])
    h = 1 - v['mask']
    rmse = (((pm.float() - v['y'])**2 * h).sum() / h.sum()).sqrt().item()
    m.train()
    return nll, rmse

def main(c=CFG):
    dev = c['dev'] if torch.cuda.is_available() else 'cpu'
    seed_all(c['seed']); os.makedirs(c['out'], exist_ok=True)
    m = Interp(c['m'], c['h']).to(dev)
    opt = torch.optim.AdamW(m.parameters(), lr=c['lr'], weight_decay=c['wd'])
    sch = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1., (s + 1) / c['warm']))
    ck, start = os.path.join(c['out'], 'last.pt'), 1
    if os.path.exists(ck):
        s = torch.load(ck, map_location=dev)
        m.load_state_dict(s['model']); opt.load_state_dict(s['opt'])
        sch.load_state_dict(s['sch']); start = s['step'] + 1
    vd = batch(1024, dev=dev, seed=c['seed'] + 1)
    log = open(os.path.join(c['out'], 'log.jsonl'), 'a')
    run = None
    for step in range(start, c['steps'] + 1):
        m.train()
        d = batch(c['B'], dev=dev)
        with amp(dev):
            l = wnll(m, d)
        opt.zero_grad(set_to_none=True)
        l.backward()
        torch.nn.utils.clip_grad_norm_(m.parameters(), c['clip'])
        opt.step(); sch.step()
        run = l.item() if run is None else 0.98 * run + 0.02 * l.item()
        if step % c['log_every'] == 0:
            print(f"step {step} nll {run:.4f} lr {sch.get_last_lr()[0]:.2e}", flush=True)
        if step % c['val_every'] == 0:
            vn, vr = evaluate(m, vd, dev)
            rec = dict(step=step, train_nll=run, val_nll=vn, val_rmse=vr)
            log.write(json.dumps(rec) + '\n'); log.flush()
            print(rec, flush=True)
        if step % c['ckpt_every'] == 0 or step == c['steps']:
            torch.save(dict(model=m.state_dict(), opt=opt.state_dict(),
                            sch=sch.state_dict(), step=step, cfg=c), ck)
    log.close()

if __name__ == '__main__':
    main()